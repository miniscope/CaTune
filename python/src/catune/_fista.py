"""FISTA deconvolution solver -- direct port of wasm/catune-solver/src/fista.rs.

Preserves exact variable names (solution, solution_prev, t_fista, step_size,
threshold, gradient, reconvolution, residual, momentum, t_new, x_prev)
for cross-language auditability.

Uses Beck & Teboulle FISTA with adaptive restart (O'Donoghue & Candes 2015).
"""

from __future__ import annotations

import numpy as np

from ._kernel import build_kernel, compute_lipschitz


def run_deconvolution(
    traces: np.ndarray,
    fs: float,
    tau_r: float,
    tau_d: float,
    lam: float,
    tolerance: float = 1e-6,
    max_iters: int = 2000,
) -> np.ndarray:
    """Run FISTA deconvolution on one or more calcium traces.

    Produces non-negative spike estimates by solving:
        min_s  (1/2)||K*s - y||^2 + lam * ||s||_1
        s.t.   s >= 0

    where K is the calcium kernel, y is the observed trace, and s is the
    spike train to recover.

    Parameters
    ----------
    traces : np.ndarray
        Input traces, shape ``(n_timepoints,)`` for a single trace or
        ``(n_cells, n_timepoints)`` for multiple traces.
    fs : float
        Sampling rate in Hz.
    tau_r : float
        Rise time constant in seconds.
    tau_d : float
        Decay time constant in seconds.
    lam : float
        L1 penalty (sparsity regularization strength).
    tolerance : float, optional
        Relative objective change threshold for convergence, by default 1e-6.
    max_iters : int, optional
        Maximum number of FISTA iterations, by default 2000.

    Returns
    -------
    np.ndarray
        Non-negative spike estimates, same shape as input ``traces``.
    """
    single_trace = traces.ndim == 1
    traces = np.atleast_2d(np.asarray(traces, dtype=np.float64))
    kernel = build_kernel(tau_r, tau_d, fs)
    lipschitz = compute_lipschitz(kernel)
    n = traces.shape[1]
    klen = len(kernel)
    results = np.zeros_like(traces)

    step_size = 1.0 / lipschitz
    threshold = step_size * lam

    for cell_idx in range(traces.shape[0]):
        trace = traces[cell_idx]
        # FISTA state -- matches Rust variable names
        solution = np.zeros(n)       # x_k
        solution_prev = np.zeros(n)  # y_k (extrapolated point)
        t_fista = 1.0
        prev_objective = np.inf

        for iteration in range(1, max_iters + 1):
            # 1. Forward convolution at y_k: reconvolution = K * y_k
            reconvolution = np.convolve(solution_prev, kernel, "full")[:n]

            # 2. Residual = K * y_k - trace
            residual = reconvolution - trace

            # 3. Adjoint convolution: gradient = K^T * residual
            #    NOTE: adjoint uses [klen-1:klen-1+n], NOT [:n]
            gradient = np.convolve(residual, kernel[::-1], "full")[
                klen - 1 : klen - 1 + n
            ]

            # 4. Save x_k, then proximal gradient step from y_k
            x_prev = solution.copy()
            solution = np.maximum(
                solution_prev - step_size * gradient - threshold, 0.0
            )

            # 5. Objective at x_{k+1} (reconvolve using solution, NOT solution_prev)
            recon_new = np.convolve(solution, kernel, "full")[:n]
            res = recon_new - trace
            objective = 0.5 * np.dot(res, res) + lam * solution.sum()

            # 6. Adaptive restart (O'Donoghue & Candes 2015)
            #    Matches fista.rs line 67: fires when objective increased and not first iter
            if objective > prev_objective and iteration > 1:
                t_fista = 1.0

            # 7. FISTA momentum extrapolation
            t_new = (1.0 + np.sqrt(1.0 + 4.0 * t_fista * t_fista)) / 2.0
            momentum = (t_fista - 1.0) / t_new
            # y_{k+1} = x_{k+1} + momentum * (x_{k+1} - x_k), projected non-negative
            solution_prev = np.maximum(
                solution + momentum * (solution - x_prev), 0.0
            )
            t_fista = t_new

            # 8. Convergence check (skip first 5 iterations, matching fista.rs line 86)
            if iteration > 5:
                rel_change = abs(prev_objective - objective) / (
                    abs(prev_objective) + 1e-10
                )
                if rel_change < tolerance:
                    break
            prev_objective = objective

        results[cell_idx] = solution

    if single_trace:
        return results[0]
    return results
