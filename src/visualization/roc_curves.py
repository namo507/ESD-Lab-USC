"""ROC curve visualization utilities for NANO Study.

Produces single-model ROC curves with bootstrap confidence bands and
multi-model comparative ROC overlays using matplotlib and scikit-learn.

Typical usage::

    fig = plot_single_roc(y_true, y_prob, 'Random Forest', output_path='roc.png')
    fig = plot_multi_model_roc({'RF': (y_true, y_prob_rf), 'LR': (y_true, y_prob_lr)})
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.metrics import auc, roc_curve

from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)


def plot_single_roc(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    model_name: str,
    output_path: Optional[str | Path] = None,
    n_bootstrap: int = 1000,
    ci: float = 0.95,
    random_state: int = 42,
) -> plt.Figure:
    """Plot a single ROC curve with bootstrapped confidence interval band.

    Args:
        y_true: Ground-truth binary labels.
        y_prob: Predicted probabilities for the positive class.
        model_name: Label for the plot legend.
        output_path: Optional save path (PNG, 300 dpi).
        n_bootstrap: Number of bootstrap resamples for CI.
        ci: Confidence level (e.g., 0.95).
        random_state: Random seed for reproducibility.

    Returns:
        Matplotlib Figure object.
    """
    y_true = np.asarray(y_true)
    y_prob = np.asarray(y_prob)

    fpr_main, tpr_main, _ = roc_curve(y_true, y_prob)
    auroc_main = auc(fpr_main, tpr_main)

    # Bootstrap CI: interpolate all TPRs onto common FPR grid
    base_fpr = np.linspace(0, 1, 200)
    bootstrap_tprs: list[np.ndarray] = []
    rng = np.random.default_rng(random_state)
    n = len(y_true)

    for _ in range(n_bootstrap):
        idx = rng.integers(0, n, size=n)
        if len(np.unique(y_true[idx])) < 2:
            continue
        fpr_b, tpr_b, _ = roc_curve(y_true[idx], y_prob[idx])
        bootstrap_tprs.append(np.interp(base_fpr, fpr_b, tpr_b))

    tprs_arr = np.array(bootstrap_tprs)
    alpha = (1.0 - ci) / 2.0
    tpr_lower = np.percentile(tprs_arr, alpha * 100, axis=0)
    tpr_upper = np.percentile(tprs_arr, (1 - alpha) * 100, axis=0)

    fig, ax = plt.subplots(figsize=(6, 5))
    ax.plot(fpr_main, tpr_main, lw=2, color="#2E86AB",
            label=f"{model_name} (AUROC = {auroc_main:.3f})")
    ax.fill_between(base_fpr, tpr_lower, tpr_upper, alpha=0.2, color="#2E86AB",
                    label=f"{int(ci*100)}% CI")
    ax.plot([0, 1], [0, 1], "k--", lw=1, label="Chance")

    ax.set_xlabel("False Positive Rate", fontsize=11)
    ax.set_ylabel("True Positive Rate", fontsize=11)
    ax.set_title(f"ROC Curve – {model_name}", fontsize=12, fontweight="bold")
    ax.legend(loc="lower right", fontsize=9)
    ax.set_xlim([0, 1])
    ax.set_ylim([0, 1.02])
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()

    if output_path is not None:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(out, dpi=300, bbox_inches="tight")
        logger.info("plot_single_roc: saved to %s (AUROC=%.3f).", out, auroc_main)

    return fig


def plot_multi_model_roc(
    models_dict: dict[str, tuple[np.ndarray, np.ndarray]],
    output_path: Optional[str | Path] = None,
) -> plt.Figure:
    """Overlay ROC curves for multiple models on a single axes.

    Args:
        models_dict: Mapping of ``model_name → (y_true, y_prob)`` tuples.
        output_path: Optional save path (PNG, 300 dpi).

    Returns:
        Matplotlib Figure object.
    """
    palette = plt.cm.tab10(np.linspace(0, 0.9, len(models_dict)))

    fig, ax = plt.subplots(figsize=(6.5, 5.5))

    for (model_name, (y_true, y_prob)), color in zip(models_dict.items(), palette):
        y_true = np.asarray(y_true)
        y_prob = np.asarray(y_prob)
        fpr, tpr, _ = roc_curve(y_true, y_prob)
        auroc = auc(fpr, tpr)
        ax.plot(fpr, tpr, lw=2, color=color, label=f"{model_name} (AUC={auroc:.3f})")

    ax.plot([0, 1], [0, 1], "k--", lw=1, label="Chance")
    ax.set_xlabel("False Positive Rate", fontsize=11)
    ax.set_ylabel("True Positive Rate", fontsize=11)
    ax.set_title("Comparative ROC Curves", fontsize=12, fontweight="bold")
    ax.legend(loc="lower right", fontsize=8, framealpha=0.9)
    ax.set_xlim([0, 1])
    ax.set_ylim([0, 1.02])
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()

    if output_path is not None:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(out, dpi=300, bbox_inches="tight")
        logger.info("plot_multi_model_roc: saved %d models to %s.", len(models_dict), out)

    return fig
