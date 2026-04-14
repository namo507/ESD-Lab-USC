"""Unsupervised clustering models for NANO Study feature exploration.

Provides DBSCAN-based clustering with automatic epsilon selection,
silhouette-based evaluation, and group-composition analysis for
identifying phenotypic subgroups from HRV/temperature feature matrices.

Typical usage::

    labels, results = run_dbscan_analysis(feature_df, group_col="group_code")
"""

from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN
from sklearn.metrics import silhouette_score
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler

from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)


def estimate_epsilon(
    X: np.ndarray,
    k: int = 5,
    quantile: float = 0.90,
) -> float:
    """Estimate DBSCAN epsilon using the k-nearest-neighbor distance heuristic.

    Computes the k-NN distance for each sample, sorts them, and selects
    the value at the given quantile as the "knee" of the k-distance graph.

    Args:
        X: Scaled feature matrix (n_samples × n_features).
        k: Number of nearest neighbors. Default ``5``.
        quantile: Quantile of the k-distance curve to use as epsilon.
            Default ``0.90``.

    Returns:
        Estimated epsilon value.
    """
    nn = NearestNeighbors(n_neighbors=k)
    nn.fit(X)
    distances, _ = nn.kneighbors(X)
    k_distances = np.sort(distances[:, -1])
    eps = float(np.quantile(k_distances, quantile))
    logger.info(
        "estimate_epsilon: k=%d, quantile=%.2f → eps=%.4f", k, quantile, eps
    )
    return eps


def run_dbscan(
    feature_df: pd.DataFrame,
    eps: Optional[float] = None,
    min_samples: int = 5,
    scale: bool = True,
) -> tuple[np.ndarray, dict[str, object]]:
    """Run DBSCAN clustering on a feature matrix with automatic eps estimation.

    Args:
        feature_df: Feature DataFrame (rows = samples, cols = numeric features).
            Non-numeric columns are dropped automatically.
        eps: DBSCAN neighborhood radius. If ``None``, estimated automatically
            using the k-NN distance heuristic.
        min_samples: Minimum number of points to form a dense region. Default ``5``.
        scale: If ``True``, z-score features before clustering. Default ``True``.

    Returns:
        Tuple of:
            - ``labels``: int array of cluster assignments (-1 = noise).
            - ``results``: dict with keys ``eps``, ``min_samples``,
              ``n_clusters``, ``n_noise``, ``silhouette_score``.
    """
    numeric_df = feature_df.select_dtypes(include=[np.number]).dropna(axis=1, how="all")
    X = numeric_df.values.copy()

    if scale:
        scaler = StandardScaler()
        X = scaler.fit_transform(X)

    # Replace any remaining NaNs with column means
    col_means = np.nanmean(X, axis=0)
    nan_mask = np.isnan(X)
    if nan_mask.any():
        X[nan_mask] = np.take(col_means, np.where(nan_mask)[1])

    if eps is None:
        eps = estimate_epsilon(X, k=min_samples)

    clustering = DBSCAN(eps=eps, min_samples=min_samples, metric="euclidean")
    labels = clustering.fit_predict(X)

    n_clusters = len(set(labels) - {-1})
    n_noise = int((labels == -1).sum())

    sil = np.nan
    if n_clusters >= 2 and n_noise < len(labels):
        valid_mask = labels != -1
        if len(np.unique(labels[valid_mask])) >= 2:
            sil = float(silhouette_score(X[valid_mask], labels[valid_mask]))

    results = {
        "eps": eps,
        "min_samples": min_samples,
        "n_clusters": n_clusters,
        "n_noise": n_noise,
        "silhouette_score": sil,
        "feature_names": list(numeric_df.columns),
    }

    logger.info(
        "run_dbscan: eps=%.4f, min_samples=%d → %d clusters, %d noise points, "
        "silhouette=%.3f",
        eps, min_samples, n_clusters, n_noise, sil,
    )
    return labels, results


def cluster_composition_analysis(
    labels: np.ndarray,
    group_series: pd.Series,
) -> pd.DataFrame:
    """Analyze the diagnostic group composition within each DBSCAN cluster.

    Cross-tabulates cluster assignments against diagnostic groups and computes
    within-cluster proportions to identify clinically meaningful phenotypic
    subgroups.

    Args:
        labels: Cluster labels from :func:`run_dbscan` (int array, -1 = noise).
        group_series: Aligned Series of diagnostic group labels
            (e.g., ``"ASIB"``, ``"PT"``, ``"TD"``).

    Returns:
        DataFrame with columns ``cluster``, ``group``, ``count``, ``pct_of_cluster``,
        ``pct_of_group``.
    """
    df = pd.DataFrame({"cluster": labels, "group": group_series.values})
    df = df[df["cluster"] != -1]  # Exclude noise

    cross = df.groupby(["cluster", "group"]).size().reset_index(name="count")

    cluster_totals = cross.groupby("cluster")["count"].transform("sum")
    group_totals = cross.groupby("group")["count"].transform("sum")

    cross["pct_of_cluster"] = (cross["count"] / cluster_totals * 100).round(1)
    cross["pct_of_group"] = (cross["count"] / group_totals * 100).round(1)

    return cross.sort_values(["cluster", "group"]).reset_index(drop=True)


def run_dbscan_analysis(
    feature_df: pd.DataFrame,
    group_col: str = "group_code",
    eps: Optional[float] = None,
    min_samples: int = 5,
) -> tuple[np.ndarray, dict[str, object]]:
    """Full DBSCAN analysis pipeline with group composition.

    Runs DBSCAN clustering on numeric features and cross-tabulates clusters
    against diagnostic groups if the group column is present.

    Args:
        feature_df: Feature DataFrame. May include a ``group_col`` column
            that will be excluded from clustering but used for composition.
        group_col: Name of the diagnostic group column. Default ``"group_code"``.
        eps: DBSCAN epsilon. If ``None``, estimated automatically.
        min_samples: DBSCAN minimum samples. Default ``5``.

    Returns:
        Tuple of:
            - ``labels``: int array of cluster assignments.
            - ``results``: dict with clustering metrics and optionally
              ``composition`` (DataFrame of group × cluster counts).
    """
    cluster_features = feature_df.drop(columns=[group_col], errors="ignore")
    labels, results = run_dbscan(cluster_features, eps=eps, min_samples=min_samples)

    if group_col in feature_df.columns:
        composition = cluster_composition_analysis(labels, feature_df[group_col])
        results["composition"] = composition
        logger.info(
            "run_dbscan_analysis: composition table has %d rows.", len(composition)
        )

    return labels, results
