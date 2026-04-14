"""
PyTorch 1D-CNN + LSTM model for ECG/IBI classification and regression.

Architecture: 3× (Conv1d → BatchNorm → ReLU → MaxPool) → LSTM → FC head.
Supports self-supervised masked-IBI pretraining and supervised fine-tuning.
"""

from __future__ import annotations

import math
import yaml
import logging
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader

try:
    import pandas as pd
except ImportError as exc:  # pragma: no cover
    raise ImportError("pandas is required for ECGDataset") from exc

logger = logging.getLogger(__name__)


# ── Dataset ───────────────────────────────────────────────────────────────────

class ECGDataset(Dataset):
    """Loads IBI windows from parquet files and returns normalised tensors.

    Args:
        data_dir: Directory containing ``*.parquet`` files, each with a
            ``ibi`` column (IBI sequence) and a ``label`` column.
        window_size: Number of IBI samples per window.
        label_col: Name of the label column in each parquet file.
        normalize: If ``True``, z-score each window independently.
    """

    def __init__(
        self,
        data_dir: str | Path,
        window_size: int = 256,
        label_col: str = "label",
        normalize: bool = True,
    ) -> None:
        self.data_dir    = Path(data_dir)
        self.window_size = window_size
        self.label_col   = label_col
        self.normalize   = normalize

        parquet_files = sorted(self.data_dir.glob("*.parquet"))
        if not parquet_files:
            raise FileNotFoundError(f"No parquet files found in {data_dir}")

        frames = [pd.read_parquet(f) for f in parquet_files]
        self.df = pd.concat(frames, ignore_index=True)

        if "ibi" not in self.df.columns:
            raise ValueError("Parquet files must contain an 'ibi' column.")
        if self.label_col not in self.df.columns:
            raise ValueError(f"Label column '{self.label_col}' not found.")

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        row = self.df.iloc[idx]
        ibi = np.asarray(row["ibi"], dtype=np.float32)

        # Pad or truncate to window_size
        if len(ibi) >= self.window_size:
            ibi = ibi[: self.window_size]
        else:
            ibi = np.pad(ibi, (0, self.window_size - len(ibi)), mode="constant",
                         constant_values=0.0)

        if self.normalize:
            mu, sigma = ibi.mean(), ibi.std()
            if sigma > 1e-8:
                ibi = (ibi - mu) / sigma

        x = torch.tensor(ibi, dtype=torch.float32).unsqueeze(0)  # (1, T)
        y = torch.tensor(float(row[self.label_col]), dtype=torch.float32)
        return x, y


# ── Building blocks ───────────────────────────────────────────────────────────

class Conv1dBnRelu(nn.Module):
    """Conv1d → BatchNorm1d → ReLU → MaxPool1d block.

    Args:
        in_channels: Number of input channels.
        out_channels: Number of convolutional filters.
        kernel_size: Convolution kernel size.
        pool_size: Max-pooling kernel size.
        stride: Convolution stride.
    """

    def __init__(
        self,
        in_channels:  int,
        out_channels: int,
        kernel_size:  int = 7,
        pool_size:    int = 2,
        stride:       int = 1,
    ) -> None:
        super().__init__()
        padding = kernel_size // 2
        self.block = nn.Sequential(
            nn.Conv1d(in_channels, out_channels, kernel_size,
                      stride=stride, padding=padding, bias=False),
            nn.BatchNorm1d(out_channels),
            nn.ReLU(inplace=True),
            nn.MaxPool1d(pool_size),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass.

        Args:
            x: Input tensor of shape ``(B, C, T)``.

        Returns:
            Output tensor of shape ``(B, out_channels, T // pool_size)``.
        """
        return self.block(x)


# ── Full model ────────────────────────────────────────────────────────────────

class ECGCNNLSTMModel(nn.Module):
    """3-block 1D-CNN followed by a bidirectional LSTM and an FC output head.

    Args:
        input_channels: Number of input channels (1 for scalar IBI series).
        num_filters: Base number of convolutional filters; doubled each block.
        lstm_hidden: LSTM hidden size.
        lstm_layers: Number of LSTM layers.
        output_dim: Output dimensionality (1 for regression; >1 for classes).
        dropout: Dropout probability applied before the FC head.
    """

    def __init__(
        self,
        input_channels: int = 1,
        num_filters:    int = 64,
        lstm_hidden:    int = 128,
        lstm_layers:    int = 2,
        output_dim:     int = 1,
        dropout:        float = 0.3,
    ) -> None:
        super().__init__()

        self.conv_blocks = nn.Sequential(
            Conv1dBnRelu(input_channels, num_filters,      kernel_size=7, pool_size=2),
            Conv1dBnRelu(num_filters,    num_filters * 2,  kernel_size=5, pool_size=2),
            Conv1dBnRelu(num_filters * 2, num_filters * 4, kernel_size=3, pool_size=2),
        )
        cnn_out_channels = num_filters * 4

        self.lstm = nn.LSTM(
            input_size    = cnn_out_channels,
            hidden_size   = lstm_hidden,
            num_layers    = lstm_layers,
            batch_first   = True,
            dropout       = dropout if lstm_layers > 1 else 0.0,
            bidirectional = True,
        )
        self.dropout = nn.Dropout(dropout)
        self.fc      = nn.Linear(lstm_hidden * 2, output_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass.

        Args:
            x: Input tensor of shape ``(B, 1, T)``.

        Returns:
            Predictions of shape ``(B, output_dim)``.
        """
        feat = self.conv_blocks(x)          # (B, C', T')
        feat = feat.permute(0, 2, 1)        # (B, T', C') for LSTM
        out, _ = self.lstm(feat)            # (B, T', 2*H)
        pooled = out.mean(dim=1)            # global average over time
        return self.fc(self.dropout(pooled))


# ── Training utilities ────────────────────────────────────────────────────────

def pretrain_self_supervised(
    model:      ECGCNNLSTMModel,
    dataloader: DataLoader,
    epochs:     int,
    device:     torch.device,
    mask_ratio: float = 0.15,
    lr:         float = 1e-3,
) -> list[float]:
    """Masked IBI reconstruction pretraining (self-supervised).

    Randomly masks ``mask_ratio`` of the input time-steps with zeros and
    trains the model to reconstruct the original sequence at those positions
    using MSE loss.

    Args:
        model: The :class:`ECGCNNLSTMModel` instance.
        dataloader: DataLoader yielding ``(x, _)`` batches.
        epochs: Number of pretraining epochs.
        device: Torch device.
        mask_ratio: Proportion of time-steps to mask.
        lr: Learning rate for Adam.

    Returns:
        List of per-epoch mean reconstruction losses.
    """
    recon_head = nn.Linear(model.fc.in_features, model.conv_blocks[-1].block[0].out_channels)
    recon_head = recon_head.to(device)

    optimizer = torch.optim.Adam(
        list(model.parameters()) + list(recon_head.parameters()), lr=lr
    )
    criterion = nn.MSELoss()
    epoch_losses: list[float] = []

    model.train()
    for epoch in range(epochs):
        running = 0.0
        for x, _ in dataloader:
            x = x.to(device)
            mask = torch.rand_like(x) < mask_ratio
            x_masked = x.clone()
            x_masked[mask] = 0.0

            feat = model.conv_blocks(x_masked)
            feat = feat.permute(0, 2, 1)
            lstm_out, _ = model.lstm(feat)
            pred = recon_head(model.dropout(lstm_out)).permute(0, 2, 1)

            target_len = pred.shape[-1]
            loss = criterion(pred, x[:, :, :target_len])

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            running += loss.item()

        mean_loss = running / len(dataloader)
        epoch_losses.append(mean_loss)
        logger.info("Pretrain epoch %d/%d — loss: %.4f", epoch + 1, epochs, mean_loss)

    return epoch_losses


def train_epoch(
    model:      ECGCNNLSTMModel,
    dataloader: DataLoader,
    optimizer:  torch.optim.Optimizer,
    criterion:  nn.Module,
    device:     torch.device,
) -> float:
    """Run one supervised training epoch.

    Args:
        model: The model to train.
        dataloader: Training DataLoader.
        optimizer: Optimiser instance.
        criterion: Loss function.
        device: Torch device.

    Returns:
        Mean training loss for the epoch.
    """
    model.train()
    running = 0.0
    for x, y in dataloader:
        x, y = x.to(device), y.to(device)
        preds = model(x).squeeze(-1)
        loss  = criterion(preds, y)
        optimizer.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()
        running += loss.item()
    return running / len(dataloader)


def evaluate_model(
    model:      ECGCNNLSTMModel,
    dataloader: DataLoader,
    device:     torch.device,
) -> tuple[np.ndarray, np.ndarray]:
    """Evaluate the model on a dataloader.

    Args:
        model: Trained model.
        dataloader: Evaluation DataLoader.
        device: Torch device.

    Returns:
        Tuple of ``(predictions, ground_truth)`` as numpy arrays.
    """
    model.eval()
    all_preds, all_targets = [], []
    with torch.no_grad():
        for x, y in dataloader:
            x, y = x.to(device), y.to(device)
            preds = model(x).squeeze(-1)
            all_preds.append(preds.cpu().numpy())
            all_targets.append(y.cpu().numpy())
    return np.concatenate(all_preds), np.concatenate(all_targets)


# ── Full pipeline ─────────────────────────────────────────────────────────────

def train_ecg_model(
    config_path: str | Path,
    data_dir:    str | Path,
    output_dir:  str | Path,
) -> None:
    """Full ECG model training pipeline driven by a YAML config file.

    Loads hyperparameters from ``config_path``, builds datasets and
    dataloaders, optionally runs self-supervised pretraining, then trains and
    evaluates the supervised model, saving the best checkpoint to
    ``output_dir``.

    Args:
        config_path: Path to ``model_config.yml``.
        data_dir: Root directory containing ``train/``, ``val/``, and
            optionally ``pretrain/`` subdirectories with parquet files.
        output_dir: Directory where model checkpoints are written.

    Config keys:
        - ``window_size`` (int)
        - ``num_filters`` (int)
        - ``lstm_hidden`` (int)
        - ``lstm_layers`` (int)
        - ``output_dim`` (int)
        - ``dropout`` (float)
        - ``batch_size`` (int)
        - ``epochs`` (int)
        - ``lr`` (float)
        - ``pretrain_epochs`` (int, optional)
        - ``label_col`` (str)
    """
    config_path = Path(config_path)
    data_dir    = Path(data_dir)
    output_dir  = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with config_path.open() as f:
        cfg: dict[str, Any] = yaml.safe_load(f)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info("Using device: %s", device)

    train_ds = ECGDataset(data_dir / "train", window_size=cfg["window_size"],
                          label_col=cfg["label_col"])
    val_ds   = ECGDataset(data_dir / "val",   window_size=cfg["window_size"],
                          label_col=cfg["label_col"])

    train_dl = DataLoader(train_ds, batch_size=cfg["batch_size"], shuffle=True,
                          num_workers=4, pin_memory=True)
    val_dl   = DataLoader(val_ds,   batch_size=cfg["batch_size"], shuffle=False,
                          num_workers=4, pin_memory=True)

    model = ECGCNNLSTMModel(
        num_filters  = cfg.get("num_filters", 64),
        lstm_hidden  = cfg.get("lstm_hidden", 128),
        lstm_layers  = cfg.get("lstm_layers", 2),
        output_dim   = cfg.get("output_dim", 1),
        dropout      = cfg.get("dropout", 0.3),
    ).to(device)

    pretrain_epochs = cfg.get("pretrain_epochs", 0)
    if pretrain_epochs > 0 and (data_dir / "pretrain").exists():
        pre_ds = ECGDataset(data_dir / "pretrain", window_size=cfg["window_size"],
                            label_col=cfg["label_col"])
        pre_dl = DataLoader(pre_ds, batch_size=cfg["batch_size"], shuffle=True,
                            num_workers=4, pin_memory=True)
        logger.info("Starting self-supervised pretraining for %d epochs", pretrain_epochs)
        pretrain_self_supervised(model, pre_dl, pretrain_epochs, device)

    criterion = nn.MSELoss() if cfg.get("output_dim", 1) == 1 else nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=cfg.get("lr", 1e-3),
                                  weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", factor=0.5, patience=5
    )

    best_val_loss = math.inf
    for epoch in range(cfg.get("epochs", 50)):
        train_loss = train_epoch(model, train_dl, optimizer, criterion, device)
        preds, targets = evaluate_model(model, val_dl, device)
        val_loss = float(np.mean((preds - targets) ** 2))

        scheduler.step(val_loss)
        logger.info(
            "Epoch %3d | train_loss=%.4f | val_loss=%.4f",
            epoch + 1, train_loss, val_loss,
        )

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            ckpt = output_dir / "best_ecg_model.pt"
            torch.save({"epoch": epoch, "model_state": model.state_dict(),
                        "val_loss": val_loss}, ckpt)
            logger.info("Checkpoint saved: %s", ckpt)

    logger.info("Training complete. Best val loss: %.4f", best_val_loss)
