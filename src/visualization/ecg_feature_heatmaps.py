"""ECG feature visualization utilities for NANO Study.

Provides a correlation clustermap, group comparison bar charts,
and HDA phase distribution plots.

Typical usage::

    plot_hrv_correlation_clustermap(feature_df, output_path='reports/figures/hrv_corr.png')
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import matplotlib
matplotlib.use("Agg")  # non-interactive backend for server/CI
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)

_HDA_PHASES = ["orienting", "sustained_attention", "termination", "inattention"]
_PHASE_COLORS = {"orienting": "#4C72B0", "sustained_attention": "#55A868",
                 "termination": "#C44E52", "inattention": "#8172B2"}


def plot_hrv_correlation_clustermap(
    feature_df: pd.DataFrame,
    output_path: Optional[str | Path] = None,
) -> plt.Figure:
    """Plot a seaborn clustermap of Pearson correlations between HRV features.

    Args:
        feature_df: Feature DataFrame (rows = participants/windows, cols = HRV features).
        output_path: If provided, save the figure to this path (PNG, 300 dpi).

    Returns:
        The ``seaborn.matrix.ClusterGrid`` figure object.
    """
    numeric_df = feature_df.select_dtypes(include=np.number).dropna(axis=1, how="all")
    corr = numeric_df.corr()

    g = sns.clustermap(
        corr,
        method="average",
        metric="euclidean",
        cmap="RdBu_r",
        center=0,
        vmin=-1,
        vmax=1,
        annot=False,
        linewidths=0.3,
        figsize=(max(8, len(corr) // 2), max(7, len(corr) // 2)),
        cbar_kws={"label": "Pearson r"},
    )
    g.fig.suptitle("HRV Feature Correlation Clustermap", y=1.02, fontsize=13, fontweight="bold")

    if output_path is not None:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        g.fig.savefig(out, dpi=300, bbox_inches="tight")
        logger.info("plot_hrv_correlation_clustermap: saved to %s.", out)

    return g.fig


def plot_hrv_group_comparison(
    feature_df: pd.DataFrame,
    group_col: str = "group_code",
    feature_cols: Optional[list[str]] = None,
    output_path: Optional[str | Path] = None,
) -> plt.Figure:
    """Grouped bar chart of HRV features by group × timepoint with error bars (±1 SE).

    Args:
        feature_df: DataFrame with ``group_col`` and HRV feature columns.
            If a ``timepoint`` column exists, groups are further split by it.
        group_col: Column identifying the participant group (ASIB/PT/TD).
        feature_cols: Feature columns to include. Defaults to all numeric columns
            except ``group_col`` and ``timepoint``.
        output_path: Optional save path for the figure.

    Returns:
        Matplotlib Figure object.
    """
    df = feature_df.copy()
    exclude = {group_col, "timepoint", "participant_id"}
    if feature_cols is None:
        feature_cols = [c for c in df.select_dtypes(include=np.number).columns if c not in exclude]

    feature_cols = feature_cols[:8]  # cap for readability
    groups = sorted(df[group_col].dropna().unique())
    n_features = len(feature_cols)
    n_groups = len(groups)

    fig, axes = plt.subplots(1, n_features, figsize=(max(10, 3 * n_features), 5), sharey=False)
    if n_features == 1:
        axes = [axes]

    palette = sns.color_palette("Set2", n_groups)

    for ax, feat in zip(axes, feature_cols):
        means, sems = [], []
        for grp in groups:
            subset = df.loc[df[group_col] == grp, feat].dropna()
            means.append(float(subset.mean()) if len(subset) > 0 else 0.0)
            sems.append(float(subset.sem()) if len(subset) > 1 else 0.0)

        x = np.arange(n_groups)
        bars = ax.bar(x, means, yerr=sems, capsize=4, color=palette, edgecolor="k", linewidth=0.6)
        ax.set_xticks(x)
        ax.set_xticklabels(groups, rotation=30, ha="right", fontsize=8)
        ax.set_title(feat, fontsize=8, wrap=True)
        ax.set_ylabel("Mean ± SE", fontsize=7)
        ax.spines[["top", "right"]].set_visible(False)

    fig.suptitle("HRV Features by Group", fontsize=12, fontweight="bold", y=1.01)
    fig.tight_layout()

    if output_path is not None:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(out, dpi=300, bbox_inches="tight")
        logger.info("plot_hrv_group_comparison: saved to %s.", out)

    return fig


def plot_hda_phase_distribution(
    hda_df: pd.DataFrame,
    group_col: str = "group_code",
    output_path: Optional[str | Path] = None,
) -> plt.Figure:
    """Stacked bar chart of HDA phase proportions by group.

    Args:
        hda_df: DataFrame with ``phase`` and ``group_col`` columns.
        group_col: Column identifying participant group.
        output_path: Optional save path for the figure.

    Returns:
        Matplotlib Figure object.
    """
    df = hda_df.copy()
    groups = sorted(df[group_col].dropna().unique())

    proportions: dict[str, list[float]] = {p: [] for p in _HDA_PHASES}
    for grp in groups:
        subset = df.loc[df[group_col] == grp, "phase"]
        counts = subset.value_counts(normalize=True)
        for p in _HDA_PHASES:
            proportions[p].append(float(counts.get(p, 0.0)))

    fig, ax = plt.subplots(figsize=(max(5, len(groups) * 1.5), 5))
    x = np.arange(len(groups))
    bottom = np.zeros(len(groups))

    for phase in _HDA_PHASES:
        vals = np.array(proportions[phase])
        ax.bar(x, vals, bottom=bottom, label=phase, color=_PHASE_COLORS[phase], edgecolor="w", linewidth=0.5)
        bottom += vals

    ax.set_xticks(x)
    ax.set_xticklabels(groups, fontsize=10)
    ax.set_ylabel("Proportion of observations", fontsize=10)
    ax.set_ylim(0, 1)
    ax.legend(title="HDA Phase", bbox_to_anchor=(1.01, 1), loc="upper left", fontsize=8)
    ax.set_title("HDA Phase Distribution by Group", fontsize=12, fontweight="bold")
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()

    if output_path is not None:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(out, dpi=300, bbox_inches="tight")
        logger.info("plot_hda_phase_distribution: saved to %s.", out)

    return fig
