"""Pydantic models for CaDecon bridge configuration."""

from __future__ import annotations

from pydantic import BaseModel, Field


class DeconConfig(BaseModel):
    """Configuration for automated CaDecon deconvolution via the bridge.

    Fields map 1:1 to the BridgeConfig TypeScript interface in @calab/io.
    Only ``autorun`` is always serialized; all other fields use
    ``exclude_none=True`` so absent values fall through to browser defaults.
    """

    autorun: bool = False
    tau_rise_init: float | None = Field(None, gt=0, description="Initial rise time constant (s)")
    tau_decay_init: float | None = Field(
        None, gt=0, description="Initial decay time constant (s)"
    )
    upsample_target: int | None = Field(None, gt=0)
    hp_filter_enabled: bool | None = None
    lp_filter_enabled: bool | None = None
    max_iterations: int | None = Field(None, gt=0, le=200)
    convergence_tol: float | None = Field(None, gt=0, lt=1)
    num_subsets: int | None = Field(None, gt=0)
    target_coverage: float | None = Field(None, gt=0, le=1)
    aspect_ratio: float | None = Field(None, gt=0)
    seed: int | None = None
