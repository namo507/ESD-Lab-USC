"""
Time-series Transformer for continuous ADOS CSS regression from ECG/IBI data.

Architecture: PatchEmbedding → PositionalEncoding → TransformerEncoder → FC.
Training loop uses AdamW + linear warmup cosine-decay scheduler + early stopping.
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
from torch.utils.data import DataLoader

logger = logging.getLogger(__name__)


# ── Patch embedding ────────────────────────────────────────────────────────────

class PatchEmbedding(nn.Module):
    """Splits a 1-D time series into non-overlapping patches and linearly projects.

    Each patch of length ``patch_size`` is projected to a ``d_model``-dimensional
    embedding. The output sequence length is ``T // patch_size``.

    Args:
        in_channels: Number of input channels (1 for scalar IBI).
        patch_size: Number of time-steps per patch.
        d_model: Embedding dimension (Transformer model width).
    """

    def __init__(
        self,
        in_channels: int = 1,
        patch_size:  int = 16,
        d_model:     int = 128,
    ) -> None:
        super().__init__()
        self.patch_size = patch_size
        self.proj = nn.Conv1d(
            in_channels, d_model,
            kernel_size=patch_size, stride=patch_size, bias=False
        )
        self.norm = nn.LayerNorm(d_model)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Project patches.

        Args:
            x: Input tensor of shape ``(B, C, T)``. ``T`` must be divisible by
               ``patch_size``; any remainder is silently truncated.

        Returns:
            Patch embeddings of shape ``(B, N, d_model)`` where
            ``N = T // patch_size``.
        """
        t_trunc = (x.shape[-1] // self.patch_size) * self.patch_size
        x = x[:, :, :t_trunc]
        out = self.proj(x)           # (B, d_model, N)
        out = out.permute(0, 2, 1)   # (B, N, d_model)
        return self.norm(out)


# ── Positional encoding ────────────────────────────────────────────────────────

class PositionalEncoding(nn.Module):
    """Learnable positional encoding added to patch embeddings.

    Unlike fixed sinusoidal encodings, these parameters are trained end-to-end,
    allowing the model to learn time-specific representations suited to the
    irregular sampling of physiological signals.

    Args:
        d_model: Embedding dimension.
        max_len: Maximum sequence length (number of patches).
        dropout: Dropout probability applied after adding positional encoding.
    """

    def __init__(
        self,
        d_model: int,
        max_len: int = 512,
        dropout: float = 0.1,
    ) -> None:
        super().__init__()
        self.dropout  = nn.Dropout(dropout)
        self.pos_emb  = nn.Embedding(max_len, d_model)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Add positional encoding.

        Args:
            x: Patch embeddings of shape ``(B, N, d_model)``.

        Returns:
            Position-aware embeddings of the same shape.
        """
        N = x.size(1)
        positions = torch.arange(N, device=x.device).unsqueeze(0)  # (1, N)
        return self.dropout(x + self.pos_emb(positions))


# ── Transformer model ─────────────────────────────────────────────────────────

class ECGTransformer(nn.Module):
    """Patch-based Transformer encoder for continuous ADOS CSS regression.

    Pipeline: PatchEmbedding → PositionalEncoding → TransformerEncoder →
    mean-pool → FC → scalar output.

    Args:
        in_channels: Input channels (1 for IBI).
        patch_size: Patch length in time-steps.
        d_model: Transformer model width.
        nhead: Number of attention heads (must divide ``d_model``).
        num_layers: Number of ``TransformerEncoderLayer`` blocks.
        dim_feedforward: FFN hidden size inside each encoder layer.
        dropout: Dropout used in attention, FFN, and positional encoding.
        max_seq_len: Maximum number of patches (for positional encoding).
        output_dim: Output dimensionality (1 for regression).
    """

    def __init__(
        self,
        in_channels:     int   = 1,
        patch_size:      int   = 16,
        d_model:         int   = 128,
        nhead:           int   = 8,
        num_layers:      int   = 4,
        dim_feedforward: int   = 512,
        dropout:         float = 0.1,
        max_seq_len:     int   = 512,
        output_dim:      int   = 1,
    ) -> None:
        super().__init__()
        self.patch_embed = PatchEmbedding(in_channels, patch_size, d_model)
        self.pos_enc     = PositionalEncoding(d_model, max_seq_len, dropout)

        encoder_layer   = nn.TransformerEncoderLayer(
            d_model         = d_model,
            nhead           = nhead,
            dim_feedforward = dim_feedforward,
            dropout         = dropout,
            activation      = "gelu",
            batch_first     = True,
            norm_first      = True,
        )
        self.transformer = nn.TransformerEncoder(
            encoder_layer, num_layers=num_layers,
            norm=nn.LayerNorm(d_model)
        )
        self.fc = nn.Linear(d_model, output_dim)
        self._init_weights()

    def _init_weights(self) -> None:
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.trunc_normal_(module.weight, std=0.02)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass.

        Args:
            x: Input of shape ``(B, 1, T)``.

        Returns:
            Predictions of shape ``(B, output_dim)``.
        """
        patches = self.patch_embed(x)      # (B, N, d_model)
        encoded = self.pos_enc(patches)    # (B, N, d_model)
        feats   = self.transformer(encoded) # (B, N, d_model)
        pooled  = feats.mean(dim=1)         # (B, d_model)
        return self.fc(pooled)              # (B, output_dim)


# ── Scheduler ─────────────────────────────────────────────────────────────────

def _warmup_cosine_schedule(
    optimizer: torch.optim.Optimizer,
    warmup_steps: int,
    total_steps:  int,
) -> torch.optim.lr_scheduler.LambdaLR:
    """Linear warmup followed by cosine annealing to zero.

    Args:
        optimizer: The optimizer whose LR will be scheduled.
        warmup_steps: Number of steps for linear LR warmup.
        total_steps: Total number of training steps.

    Returns:
        A ``LambdaLR`` scheduler.
    """
    def lr_lambda(step: int) -> float:
        if step < warmup_steps:
            return float(step) / max(1, warmup_steps)
        progress = float(step - warmup_steps) / max(1, total_steps - warmup_steps)
        return max(0.0, 0.5 * (1.0 + math.cos(math.pi * progress)))

    return torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)


# ── Training pipeline ─────────────────────────────────────────────────────────

def train_transformer(
    config_path: str | Path,
    data_dir:    str | Path,
    output_dir:  str | Path,
) -> None:
    """Full Transformer training pipeline driven by a YAML config.

    Loads hyperparameters from ``config_path``, creates datasets via
    :class:`~src.models.deep_learning_ecg.ECGDataset`, trains with AdamW
    + linear warmup + cosine decay, and implements early stopping on
    validation loss. Best checkpoint is saved to ``output_dir``.

    Args:
        config_path: Path to a YAML config file.
        data_dir: Root directory with ``train/`` and ``val/`` parquet
            subdirectories.
        output_dir: Directory for saving checkpoints and logs.

    Config keys (all optional unless noted):
        - ``window_size`` (int, default 256): IBI samples per window.
        - ``patch_size`` (int, default 16): Transformer patch length.
        - ``d_model`` (int, default 128): Transformer width.
        - ``nhead`` (int, default 8): Attention heads.
        - ``num_layers`` (int, default 4): Encoder layers.
        - ``dim_feedforward`` (int, default 512): FFN hidden size.
        - ``dropout`` (float, default 0.1)
        - ``batch_size`` (int, default 32)
        - ``epochs`` (int, default 100)
        - ``lr`` (float, default 1e-4)
        - ``warmup_ratio`` (float, default 0.1): Fraction of steps for warmup.
        - ``patience`` (int, default 10): Early stopping patience in epochs.
        - ``label_col`` (str, default "ados_css")
        - ``output_dim`` (int, default 1)
    """
    from src.models.deep_learning_ecg import ECGDataset  # local import to avoid circular

    config_path = Path(config_path)
    data_dir    = Path(data_dir)
    output_dir  = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with config_path.open() as f:
        cfg: dict[str, Any] = yaml.safe_load(f)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info("Device: %s", device)

    window_size = cfg.get("window_size", 256)
    label_col   = cfg.get("label_col",   "ados_css")
    batch_size  = cfg.get("batch_size",  32)

    train_ds = ECGDataset(data_dir / "train", window_size=window_size, label_col=label_col)
    val_ds   = ECGDataset(data_dir / "val",   window_size=window_size, label_col=label_col)
    train_dl = DataLoader(train_ds, batch_size=batch_size, shuffle=True,
                          num_workers=4, pin_memory=True)
    val_dl   = DataLoader(val_ds,   batch_size=batch_size, shuffle=False,
                          num_workers=4, pin_memory=True)

    model = ECGTransformer(
        patch_size      = cfg.get("patch_size",      16),
        d_model         = cfg.get("d_model",         128),
        nhead           = cfg.get("nhead",           8),
        num_layers      = cfg.get("num_layers",      4),
        dim_feedforward = cfg.get("dim_feedforward", 512),
        dropout         = cfg.get("dropout",         0.1),
        output_dim      = cfg.get("output_dim",      1),
    ).to(device)

    n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    logger.info("ECGTransformer — trainable parameters: %d", n_params)

    epochs        = cfg.get("epochs",       100)
    lr            = cfg.get("lr",           1e-4)
    warmup_ratio  = cfg.get("warmup_ratio", 0.1)
    patience      = cfg.get("patience",     10)
    total_steps   = epochs * len(train_dl)
    warmup_steps  = int(total_steps * warmup_ratio)

    optimizer  = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-2)
    scheduler  = _warmup_cosine_schedule(optimizer, warmup_steps, total_steps)
    criterion  = nn.MSELoss()

    best_val   = math.inf
    no_improve = 0
    global_step = 0

    for epoch in range(epochs):
        # ── Training ──
        model.train()
        train_losses: list[float] = []
        for x, y in train_dl:
            x, y = x.to(device), y.to(device)
            preds = model(x).squeeze(-1)
            loss  = criterion(preds, y)
            optimizer.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            scheduler.step()
            train_losses.append(loss.item())
            global_step += 1

        # ── Validation ──
        model.eval()
        val_losses: list[float] = []
        with torch.no_grad():
            for x, y in val_dl:
                x, y = x.to(device), y.to(device)
                preds = model(x).squeeze(-1)
                val_losses.append(criterion(preds, y).item())

        mean_train = float(np.mean(train_losses))
        mean_val   = float(np.mean(val_losses))
        current_lr = scheduler.get_last_lr()[0]

        logger.info(
            "Epoch %3d/%d | train=%.4f | val=%.4f | lr=%.2e",
            epoch + 1, epochs, mean_train, mean_val, current_lr,
        )

        if mean_val < best_val:
            best_val   = mean_val
            no_improve = 0
            ckpt = output_dir / "best_transformer.pt"
            torch.save({
                "epoch":       epoch,
                "model_state": model.state_dict(),
                "val_loss":    best_val,
                "config":      cfg,
            }, ckpt)
            logger.info("  ✓ New best checkpoint saved: %s", ckpt)
        else:
            no_improve += 1
            if no_improve >= patience:
                logger.info(
                    "Early stopping triggered at epoch %d (no improvement for %d epochs).",
                    epoch + 1, patience,
                )
                break

    logger.info("Training complete. Best validation loss: %.4f", best_val)
