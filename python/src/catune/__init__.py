"""CaTune companion: calcium imaging deconvolution and data preparation."""

from ._kernel import build_kernel, compute_lipschitz, tau_to_ar2
from ._fista import run_deconvolution
from ._io import load_tuning_data, save_for_tuning

__version__ = "0.1.0"
__all__ = [
    "build_kernel",
    "tau_to_ar2",
    "compute_lipschitz",
    "run_deconvolution",
    "save_for_tuning",
    "load_tuning_data",
]
