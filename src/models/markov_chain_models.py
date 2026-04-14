"""Continuous-time Markov chain models for HDA phase transitions.

Estimates transition rate matrices from phase sequences, computes
stationary distributions, performs group comparisons, and simulates
trajectories via the Gillespie algorithm.

Typical usage::

    Q = estimate_transition_rates(phase_df)
    pi = compute_stationary_distribution(Q)
"""

from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd
from scipy import linalg, stats

from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)

_DEFAULT_STATES = ["orienting", "sustained_attention", "termination", "inattention"]


def estimate_transition_rates(
    phase_sequence_df: pd.DataFrame,
    states: list[str] = _DEFAULT_STATES,
) -> np.ndarray:
    """Estimate the continuous-time Markov chain (CTMC) transition rate matrix.

    Uses maximum likelihood estimation: off-diagonal rate q_ij = n_ij / T_i,
    where n_ij is the number of transitions i→j and T_i is total holding time in state i.
    Diagonal entries are set to -Σ_{j≠i} q_ij.

    Args:
        phase_sequence_df: DataFrame with columns ``phase`` (state label) and
            ``duration_sec`` (time spent in state before transitioning).
        states: Ordered list of state names.

    Returns:
        Rate matrix Q of shape (n_states × n_states); diagonal is negative,
        rows sum to zero.
    """
    n = len(states)
    state_idx = {s: i for i, s in enumerate(states)}
    df = phase_sequence_df.copy()
    df = df[df["phase"].isin(states)].reset_index(drop=True)

    holding_times = np.zeros(n)
    transition_counts = np.zeros((n, n))

    for row_i in range(len(df) - 1):
        from_state = df.loc[row_i, "phase"]
        to_state = df.loc[row_i + 1, "phase"]
        duration = float(df.loc[row_i, "duration_sec"])
        if from_state not in state_idx or to_state not in state_idx:
            continue
        fi, ti = state_idx[from_state], state_idx[to_state]
        holding_times[fi] += duration
        if fi != ti:
            transition_counts[fi, ti] += 1

    # Last row contributes holding time only
    last_state = df.iloc[-1]["phase"]
    if last_state in state_idx:
        holding_times[state_idx[last_state]] += float(df.iloc[-1]["duration_sec"])

    Q = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            if i != j and holding_times[i] > 0:
                Q[i, j] = transition_counts[i, j] / holding_times[i]
        Q[i, i] = -Q[i, :].sum()

    logger.info("estimate_transition_rates: Q matrix estimated from %d transitions.", int(transition_counts.sum()))
    return Q


def compute_stationary_distribution(rate_matrix: np.ndarray) -> np.ndarray:
    """Compute the stationary distribution π of a CTMC from rate matrix Q.

    Solves π Q = 0 subject to Σ πᵢ = 1 by finding the left null vector of Q.

    Args:
        rate_matrix: CTMC rate matrix Q (n × n), rows sum to zero.

    Returns:
        Stationary probability vector π of length n, sums to 1.

    Raises:
        np.linalg.LinAlgError: If the null space cannot be computed.
    """
    n = rate_matrix.shape[0]
    # Build augmented system: Q^T with one row replaced by [1, 1, ..., 1] = 1
    A = rate_matrix.T.copy()
    A[-1, :] = 1.0
    b = np.zeros(n)
    b[-1] = 1.0

    pi = np.linalg.solve(A, b)
    pi = np.abs(pi)
    pi /= pi.sum()
    return pi


def compare_group_transitions(
    group_dfs: list[pd.DataFrame],
    group_names: list[str],
) -> dict[str, object]:
    """Compare CTMC Q matrices across groups using a likelihood ratio test.

    Estimates one Q per group and one pooled Q. The LRT statistic is
    2 * (log_lik_separate - log_lik_pooled), compared to χ² with
    (n_groups - 1) * n_free_params degrees of freedom.

    Args:
        group_dfs: List of phase sequence DataFrames (one per group).
        group_names: Corresponding group names.

    Returns:
        Dict with keys:
            - ``rate_matrices``: dict of group_name → Q array.
            - ``stationary_distributions``: dict of group_name → π array.
            - ``lrt_statistic``: LRT chi-squared value.
            - ``lrt_df``: Degrees of freedom.
            - ``lrt_p_value``: p-value from χ² distribution.
    """
    rate_matrices: dict[str, np.ndarray] = {}
    stationary: dict[str, np.ndarray] = {}

    for name, df in zip(group_names, group_dfs):
        Q = estimate_transition_rates(df)
        rate_matrices[name] = Q
        stationary[name] = compute_stationary_distribution(Q)

    # Pooled Q from concatenated data
    pooled_df = pd.concat(group_dfs, ignore_index=True)
    Q_pooled = estimate_transition_rates(pooled_df)

    # LRT: approximate log-likelihood from off-diagonal rates
    def _log_lik(Q: np.ndarray, df: pd.DataFrame) -> float:
        n = Q.shape[0]
        states = _DEFAULT_STATES[:n]
        state_idx = {s: i for i, s in enumerate(states)}
        ll = 0.0
        for row_i in range(len(df) - 1):
            fi = state_idx.get(df.iloc[row_i]["phase"], -1)
            ti = state_idx.get(df.iloc[row_i + 1]["phase"], -1)
            dur = float(df.iloc[row_i]["duration_sec"])
            if fi < 0 or ti < 0 or fi == ti:
                continue
            rate = Q[fi, ti]
            if rate > 0:
                ll += np.log(rate) - Q[fi, fi] * dur  # type: ignore[operator]
        return ll

    ll_separate = sum(_log_lik(rate_matrices[n], d) for n, d in zip(group_names, group_dfs))
    ll_pooled = _log_lik(Q_pooled, pooled_df)
    lrt_stat = 2.0 * (ll_separate - ll_pooled)
    n_states = Q_pooled.shape[0]
    n_free = n_states * (n_states - 1)
    df_lrt = (len(group_names) - 1) * n_free
    p_value = float(stats.chi2.sf(lrt_stat, df=df_lrt))

    logger.info(
        "compare_group_transitions: LRT χ²(%.0f)=%.3f, p=%.4f", df_lrt, lrt_stat, p_value
    )
    return {
        "rate_matrices": rate_matrices,
        "stationary_distributions": stationary,
        "lrt_statistic": float(lrt_stat),
        "lrt_df": df_lrt,
        "lrt_p_value": p_value,
    }


def simulate_hda_trajectory(
    rate_matrix: np.ndarray,
    duration_sec: float = 300.0,
    dt: float = 0.1,
    initial_state: int = 0,
    random_state: Optional[int] = 42,
) -> pd.DataFrame:
    """Simulate an HDA phase trajectory using the Gillespie algorithm.

    Args:
        rate_matrix: CTMC rate matrix Q (n × n).
        duration_sec: Simulation duration in seconds.
        dt: Output time resolution in seconds (for resampled output).
        initial_state: Index of the starting state.
        random_state: Random seed for reproducibility.

    Returns:
        DataFrame with columns ``time_sec`` (0 to duration_sec at ``dt`` steps)
        and ``state_idx`` (integer state at each time point).
    """
    rng = np.random.default_rng(random_state)
    n_states = rate_matrix.shape[0]
    state_names = _DEFAULT_STATES[:n_states]

    times = [0.0]
    states = [initial_state]
    t = 0.0
    current = initial_state

    while t < duration_sec:
        total_rate = -rate_matrix[current, current]
        if total_rate <= 0:
            break
        # Holding time ~ Exponential(total_rate)
        hold = rng.exponential(1.0 / total_rate)
        t += hold
        if t >= duration_sec:
            break
        # Choose next state proportional to off-diagonal rates
        off_diag = rate_matrix[current, :].copy()
        off_diag[current] = 0.0
        off_diag = np.maximum(off_diag, 0)
        total_off = off_diag.sum()
        if total_off == 0:
            break
        probs = off_diag / total_off
        current = int(rng.choice(n_states, p=probs))
        times.append(t)
        states.append(current)

    # Resample to uniform grid
    uniform_t = np.arange(0, duration_sec, dt)
    resampled_states = np.searchsorted(times, uniform_t, side="right") - 1
    resampled_states = np.clip(resampled_states, 0, len(states) - 1)
    state_values = [states[i] for i in resampled_states]

    result = pd.DataFrame({
        "time_sec": uniform_t,
        "state_idx": state_values,
        "phase": [state_names[s] for s in state_values],
    })
    logger.info(
        "simulate_hda_trajectory: simulated %.1fs with %d transitions.", duration_sec, len(times) - 1
    )
    return result
