#!/usr/bin/env python3
"""Benchmark bi-exponential fitting: time-constant accuracy and cost.

`fit_biexponential` turns the free-form kernel the InDeCa loop estimates into
the (tau_rise, tau_decay) pair CaDecon reports, submits to the community
database, and sells as "no manual tuning needed". Those numbers being right is
the product. This measures how right they are, and what they cost, against
kernels whose true time constants are known exactly.

It fits kernels directly rather than driving the whole loop. That keeps every
number attributable: a change in recovered tau here is the fitter's, not an
interaction with spike inference, subset medians, or the convergence rule.
The trade-off is that it cannot tell you whether a fitter change moves the
outer loop's *iteration count* -- for that, drive the shipped app (needs
Playwright and a served build)::

    calab.decon(traces, fs, headless=True, autorun=True,
                app_url="http://localhost:5173/CaDecon/")

whose result metadata carries `num_iterations`, `converged`, and
`converged_at_iteration`.

Usage
-----
    .venv/bin/python scripts/bench-biexp.py
    .venv/bin/python scripts/bench-biexp.py --json /tmp/branch.json
    .venv/bin/python scripts/bench-biexp.py --compare /tmp/main.json /tmp/branch.json

To A/B two revisions, rebuild the extension between runs::

    git checkout main && (cd python && ../.venv/bin/maturin develop --release)
    .venv/bin/python scripts/bench-biexp.py --json /tmp/main.json
    git checkout <branch> && (cd python && ../.venv/bin/maturin develop --release)
    .venv/bin/python scripts/bench-biexp.py --json /tmp/branch.json
    .venv/bin/python scripts/bench-biexp.py --compare /tmp/main.json /tmp/branch.json
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time

import numpy as np

import calab

# Kernel duration as a multiple of tau_decay, matching KERNEL_DURATION_MULTIPLE
# in packages/compute/src/kernel-math.ts.
KERNEL_DURATION_MULTIPLE = 5

# The cold grid spans tau_decay in [0.05, 5.0] over 20 log-spaced nodes, which
# puts adjacent nodes 27.4% apart. A fit pinned to the grid is therefore up to
# 12.88% wrong by construction. The default sweep deliberately includes decay
# constants near grid nodes *and* between them (1.68 s is the log-space midpoint
# of nodes 14 and 15) so a grid-quantised fitter and a refining one are
# distinguishable rather than accidentally agreeing.
TAU_DECAYS = (0.7, 1.1, 1.5, 1.68, 2.3)
TAU_RISES = (0.05, 0.15)
SAMPLING_RATES = (10.0, 20.0, 30.0)

# A rise shorter than this many samples carries no information the fitter could
# recover -- at 10 Hz, tau_rise = 0.05 s is half a sample, and biexp_fit
# correctly clamps it to dt. Those configurations stay in the sweep (they still
# exercise tau_decay, and clamping is behaviour worth not regressing) but are
# excluded from the tau_rise summary, where they would otherwise contribute a
# ~100% "error" that says nothing about the solver.
MIN_RESOLVABLE_RISE_SAMPLES = 1.5

# Relative amplitude of the fast noise artifact the two-component model exists
# to absorb. 0.0 exercises the slow-only path; 0.95 is the regime the fixtures
# in biexp_fit.rs use, where the fit sits near the bs >= bf gate and the
# objective kinks.
FAST_FRACTIONS = (0.0, 0.95)

# Gaussian noise on the free kernel, as a fraction of its peak. The estimated
# kernel is an average over many events, so it is far cleaner than any single
# trace; these are deliberately small.
NOISE_LEVELS = (0.0, 0.01, 0.05)


def make_free_kernel(
    tau_rise: float,
    tau_decay: float,
    fast_fraction: float,
    noise: float,
    fs: float,
    rng: np.random.Generator,
) -> np.ndarray:
    """Synthesize a free-form kernel of the shape the loop hands the fitter.

    Slow bi-exponential (the calcium kernel) plus an optional fast component
    with sub-sample time constants (the false-positive artifact described in
    biexp_fit.rs), plus Gaussian noise as a fraction of peak.
    """
    dt = 1.0 / fs
    n = max(16, int(round(KERNEL_DURATION_MULTIPLE * tau_decay * fs)))
    t = np.arange(n) * dt

    slow = np.exp(-t / tau_decay) - np.exp(-t / tau_rise)
    h = slow.copy()
    if fast_fraction > 0:
        # Sub-sample fast taus, matching the ranges the cold grid searches
        # (tau_r_fast <= 2*dt, tau_d_fast <= min(8*dt, tau_d*0.15)).
        tau_r_fast, tau_d_fast = 0.25 * dt, 1.75 * dt
        h = h + fast_fraction * (np.exp(-t / tau_d_fast) - np.exp(-t / tau_r_fast))
    if noise > 0:
        h = h + rng.normal(0.0, noise * float(np.max(np.abs(h))), n)
    return h.astype(np.float32)


def bench(fs_list, tau_rises, tau_decays, fast_fractions, noise_levels, repeats: int) -> list[dict]:
    rows = []
    for fs in fs_list:
        for tau_rise in tau_rises:
            for tau_decay in tau_decays:
                if tau_rise >= tau_decay * 0.5:
                    continue
                for fast in fast_fractions:
                    for noise in noise_levels:
                        for rep in range(repeats):
                            rng = np.random.default_rng(9000 + rep)
                            h = make_free_kernel(tau_rise, tau_decay, fast, noise, fs, rng)

                            t0 = time.perf_counter()
                            fit = calab.fit_biexponential(h, fs, refine=True)
                            seconds = time.perf_counter() - t0

                            rows.append({
                                "fs": fs,
                                "tau_decay_true": tau_decay,
                                "tau_rise_true": tau_rise,
                                "rise_samples": tau_rise * fs,
                                "rise_resolvable": tau_rise * fs >= MIN_RESOLVABLE_RISE_SAMPLES,
                                "fast_fraction": fast,
                                "noise": noise,
                                "rep": rep,
                                "seconds": seconds,
                                "tau_rise": fit.tau_rise,
                                "tau_decay": fit.tau_decay,
                                "fit_mode": fit.fit_mode,
                                "residual": fit.residual,
                                "tau_decay_err": abs(fit.tau_decay - tau_decay) / tau_decay,
                                "tau_rise_err": abs(fit.tau_rise - tau_rise) / tau_rise,
                            })
    return rows


def grid_nodes() -> np.ndarray:
    """The 20 log-spaced tau_decay nodes the cold grid search evaluates."""
    return np.exp(np.linspace(np.log(0.05), np.log(5.0), 20))


def quantisation_fraction(rows: list[dict], tol: float = 1e-3) -> float:
    """Fraction of fits whose tau_decay landed on a cold-grid node.

    A refining fitter should essentially never land exactly on a node; a fitter
    whose refinement is being discarded lands on one every time. This is the
    single number that separates the two, and it is what regressed silently
    before -- the accuracy assertions could not see it, because the nearest node
    is always within 12.88% of the truth.
    """
    nodes = grid_nodes()
    pinned = sum(1 for r in rows if np.min(np.abs(nodes - r["tau_decay"]) / r["tau_decay"]) < tol)
    return pinned / len(rows) if rows else 0.0


def summarize(rows: list[dict], label: str) -> dict:
    resolvable = [r for r in rows if r["rise_resolvable"]]
    s = {
        "label": label,
        "n": len(rows),
        "n_rise_resolvable": len(resolvable),
        "median_seconds": statistics.median(r["seconds"] for r in rows),
        "total_seconds": sum(r["seconds"] for r in rows),
        "median_tau_decay_err": statistics.median(r["tau_decay_err"] for r in rows),
        "p95_tau_decay_err": float(np.percentile([r["tau_decay_err"] for r in rows], 95)),
        "median_tau_rise_err": statistics.median(r["tau_rise_err"] for r in resolvable),
        "grid_pinned_fraction": quantisation_fraction(rows),
    }
    print(
        f"\n{label}: {s['n']} fits in {s['total_seconds'] * 1000:.0f} ms "
        f"(median {s['median_seconds'] * 1e6:.0f} us)\n"
        f"  tau_decay error  median {s['median_tau_decay_err'] * 100:.2f}%  "
        f"p95 {s['p95_tau_decay_err'] * 100:.2f}%\n"
        f"  tau_rise error   median {s['median_tau_rise_err'] * 100:.2f}%  "
        f"(over the {s['n_rise_resolvable']}/{s['n']} fits whose rise spans "
        f"{MIN_RESOLVABLE_RISE_SAMPLES}+ samples)\n"
        f"  pinned to a cold-grid node: {s['grid_pinned_fraction'] * 100:.1f}% of fits"
    )
    return s


def compare(path_a: str, path_b: str) -> int:
    a, b = (json.load(open(p)) for p in (path_a, path_b))
    sa, sb = a["summary"], b["summary"]
    print(f"{'metric':<26}{'A':>14}{'B':>14}{'delta':>14}")
    for key, scale, unit in [
        ("median_seconds", 1e6, " us"),
        ("total_seconds", 1e3, " ms"),
        ("median_tau_decay_err", 100, " %"),
        ("p95_tau_decay_err", 100, " %"),
        ("median_tau_rise_err", 100, " %"),
        ("grid_pinned_fraction", 100, " %"),
    ]:
        va, vb = sa[key] * scale, sb[key] * scale
        print(f"{key:<26}{va:>11.3f}{unit}{vb:>11.3f}{unit}{vb - va:>11.3f}{unit}")

    failures = []
    if sb["median_tau_decay_err"] > sa["median_tau_decay_err"] * 1.1 + 1e-9:
        failures.append("median tau_decay error rose by more than 10%")
    if sa["total_seconds"] and sb["total_seconds"] / sa["total_seconds"] > 1.25:
        failures.append(
            f"wall clock regressed {(sb['total_seconds'] / sa['total_seconds'] - 1) * 100:.0f}% (> 25%)"
        )
    if sb["grid_pinned_fraction"] > sa["grid_pinned_fraction"] + 0.05:
        failures.append("more fits are pinned to cold-grid nodes")
    if failures:
        print("\nREGRESSION: " + "; ".join(failures))
        return 1
    print("\nOK: no accuracy or wall-clock regression")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--fs", type=float, nargs="+", default=list(SAMPLING_RATES))
    p.add_argument("--tau-rise", type=float, nargs="+", default=list(TAU_RISES))
    p.add_argument("--tau-decay", type=float, nargs="+", default=list(TAU_DECAYS))
    p.add_argument("--fast", type=float, nargs="+", default=list(FAST_FRACTIONS))
    p.add_argument("--noise", type=float, nargs="+", default=list(NOISE_LEVELS))
    p.add_argument("--repeats", type=int, default=5, help="Noise seeds per configuration")
    p.add_argument("--json", metavar="PATH", help="Write full results here")
    p.add_argument("--label", default="run")
    p.add_argument("--compare", nargs=2, metavar=("A.json", "B.json"))
    p.add_argument("--verbose", action="store_true", help="Print every fit")
    args = p.parse_args()

    if args.compare:
        return compare(*args.compare)

    rows = bench(args.fs, args.tau_rise, args.tau_decay, args.fast, args.noise, args.repeats)
    if args.verbose:
        for r in rows:
            print(
                f"  fs={r['fs']:>4.0f} tr={r['tau_rise_true']:.2f} td={r['tau_decay_true']:.2f} "
                f"fast={r['fast_fraction']:.2f} noise={r['noise']:.2f} "
                f"-> td={r['tau_decay']:.4f} ({r['tau_decay_err'] * 100:>6.2f}%) "
                f"tr={r['tau_rise']:.4f} ({r['tau_rise_err'] * 100:>6.2f}%) "
                f"{r['seconds'] * 1e6:>6.0f} us  {r['fit_mode']}"
            )
    summary = summarize(rows, args.label)

    if args.json:
        with open(args.json, "w") as fh:
            json.dump({"summary": summary, "rows": rows}, fh, indent=2)
        print(f"wrote {args.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
