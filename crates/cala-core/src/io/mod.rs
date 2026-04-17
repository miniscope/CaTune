//! Binary input formats CaLa accepts directly (no JS-side decoding).
//!
//! Phase 1 ships uncompressed 8-bit AVI — the common miniscope raw
//! format. Post-v1 formats (TIFF, compressed AVI via WebCodecs, MP4)
//! plug into the same `FrameSource` abstraction and live in separate
//! modules; see design §11.

mod avi_uncompressed;

pub use avi_uncompressed::{AviError, AviUncompressedReader};
