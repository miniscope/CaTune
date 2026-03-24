# Quick Start

CaLab provides two approaches to calcium trace deconvolution:

- **CaTune** — you choose the deconvolution parameters interactively in the browser, then apply them in batch. Best when you have domain knowledge about your indicator's kinetics or want fine control.
- **CaDecon** — automatically estimates the calcium kernel and deconvolution parameters from your data. Best when you want a hands-free pipeline or don't know the kinetics in advance.

Both use the same fast Rust FISTA solver under the hood.

## CaTune: interactive parameter tuning

```python
import numpy as np
import calab

traces = np.load("my_traces.npy")  # (n_cells, n_timepoints)

# Open CaTune in the browser — tune parameters visually, then click Export
params = calab.tune(traces, fs=30.0)
```

This returns a dict with `tau_rise`, `tau_decay`, `lambda_`, `fs`, and `filter_enabled`, or `None` if you cancel.

Apply those parameters across all your traces:

```python
activity = calab.run_deconvolution(
    traces, fs=30.0,
    tau_r=params["tau_rise"],
    tau_d=params["tau_decay"],
    lam=params["lambda_"],
)
```

If you already know your parameters from the literature, you can skip the browser entirely and call `run_deconvolution()` directly.

See the [CaTune guide](guides/catune.md) for the full workflow.

## CaDecon: automated deconvolution

```python
result = calab.decon(traces, fs=30.0, autorun=True)

print(result.activity.shape)    # deconvolved activity
print(result.kernel_slow.shape) # estimated kernel waveform
print(result.metadata)          # tau values, convergence info
```

CaDecon estimates the kernel and deconvolution parameters from your data — no manual tuning needed. For batch processing without a browser window:

```python
result = calab.decon(traces, fs=30.0, headless=True, autorun=True)
```

See the [CaDecon guide](guides/cadecon.md) for headless mode, configuration options, and the InDeCa building blocks.

## Loading data

Load traces from CaImAn or Minian outputs (requires `pip install calab[loaders]`):

```python
# CaImAn HDF5
traces, meta = calab.load_caiman("caiman_results.hdf5")

# Minian Zarr (sampling rate must be provided)
traces, meta = calab.load_minian("minian_output/", fs=30.0)

# Then use either approach
params = calab.tune(traces, meta["sampling_rate_hz"])
# or
result = calab.decon(traces, meta["sampling_rate_hz"], autorun=True)
```

See the [Loaders guide](guides/loaders.md) for details.

## Synthetic data

Generate traces with known ground truth for testing and benchmarking:

```python
result = calab.simulate()

print(result.traces.shape)             # (100, 27000) — 100 cells, 15 min at 30 Hz
print(result.ground_truth[0].spikes)   # spike counts at imaging rate for cell 0
```

Available presets: `gcamp6f`, `gcamp6s`, `gcamp6m`, `jgcamp8f`, `ogb1`, and `clean`.

See the [Simulation guide](guides/simulation.md) for configuration options.
