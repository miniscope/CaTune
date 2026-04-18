//! Target-specific bindings on top of the pure-Rust numerical core.
//!
//! Each module here is a thin marshalling layer — **no algorithmic
//! logic lives in `bindings/`**. Config flows across the boundary as
//! JSON strings matching the config structs' `serde` shape, so the
//! same parse path is natively testable (§4.1) without needing a WASM
//! runtime stood up.

#[cfg(feature = "serde")]
pub mod config_json;

#[cfg(feature = "jsbindings")]
pub mod wasm;
