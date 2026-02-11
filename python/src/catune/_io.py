"""Data I/O functions for CaTune-compatible file export and import.

Saves calcium traces as .npy files with JSON metadata sidecars,
compatible with CaTune's browser-side .npy parser (src/lib/npy-parser.ts).
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np


def save_for_tuning(
    traces: np.ndarray,
    fs: float,
    path: str | Path,
    metadata: dict | None = None,
) -> None:
    """Save calcium traces in CaTune-compatible format.

    Creates two files:
      - ``{path}.npy`` -- Float64 array, shape ``(n_cells, n_timepoints)``,
        C-contiguous, little-endian (``<f8``).
      - ``{path}_metadata.json`` -- JSON sidecar with sampling rate,
        schema version, dimensions, and optional user metadata.

    The ``.npy`` file is loadable by CaTune's browser ``.npy`` parser, which
    expects ``dtype='<f8'`` and ``fortran_order=False``.

    Parameters
    ----------
    traces : np.ndarray
        Calcium traces, shape ``(n_timepoints,)`` for a single trace or
        ``(n_cells, n_timepoints)`` for multiple traces.
    fs : float
        Sampling rate in Hz.
    path : str or Path
        Output path stem (without extension). Will create ``{path}.npy``
        and ``{path}_metadata.json``.
    metadata : dict, optional
        Additional metadata to include in the JSON sidecar. Keys are merged
        into the output; built-in keys take precedence.

    Raises
    ------
    ValueError
        If ``traces`` has more than 2 dimensions.
    """
    path = str(path)

    # Coerce to Float64, C-contiguous
    traces = np.ascontiguousarray(traces, dtype=np.float64)

    # Ensure 2D: (n_cells, n_timepoints)
    if traces.ndim == 1:
        traces = traces.reshape(1, -1)
    elif traces.ndim > 2:
        raise ValueError(
            f"traces must be 1D or 2D, got {traces.ndim}D array"
        )

    # Save .npy (Float64, C-contiguous, little-endian)
    np.save(f"{path}.npy", traces)

    # Build metadata sidecar
    meta = {
        **(metadata or {}),
        "schema_version": "1.0.0",
        "sampling_rate_hz": fs,
        "num_cells": int(traces.shape[0]),
        "num_timepoints": int(traces.shape[1]),
        "dtype": "<f8",
    }

    with open(f"{path}_metadata.json", "w") as f:
        json.dump(meta, f, indent=2)


def load_tuning_data(path: str | Path) -> tuple[np.ndarray, dict]:
    """Load calcium traces and metadata saved by :func:`save_for_tuning`.

    Parameters
    ----------
    path : str or Path
        Path stem (without extension), matching the ``path`` argument used
        in :func:`save_for_tuning`.

    Returns
    -------
    traces : np.ndarray
        Loaded traces array, dtype float64.
    metadata : dict
        Metadata from the JSON sidecar.

    Raises
    ------
    FileNotFoundError
        If either ``{path}.npy`` or ``{path}_metadata.json`` is missing.
    """
    path = str(path)
    npy_path = f"{path}.npy"
    json_path = f"{path}_metadata.json"

    if not Path(npy_path).exists():
        raise FileNotFoundError(
            f"Trace data file not found: {npy_path}. "
            f"Expected .npy file at this location."
        )
    if not Path(json_path).exists():
        raise FileNotFoundError(
            f"Metadata file not found: {json_path}. "
            f"Expected _metadata.json sidecar at this location."
        )

    traces = np.load(npy_path)

    with open(json_path) as f:
        metadata = json.load(f)

    return traces, metadata
