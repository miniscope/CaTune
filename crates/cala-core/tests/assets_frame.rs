//! Tests for axis conventions and the `Frame` view type.
//!
//! Per design §5 / thesis §3.2.1, axis tags prevent "dim 0 means time" bugs
//! by making axis identity explicit at module boundaries. `Frame` is a
//! borrowed 2D view with row-major storage — these tests pin that layout
//! so downstream preprocess code can rely on it.

use calab_cala_core::assets::{Axis, Frame, FrameMut, ShapeError};

#[test]
fn axis_variants_are_distinct() {
    // Axis identity is what makes the convention work — if Height == Width
    // by accident, the whole point of the tag is gone.
    assert_ne!(Axis::Height, Axis::Width);
    assert_ne!(Axis::Height, Axis::Time);
    assert_ne!(Axis::Width, Axis::Time);
    assert_ne!(Axis::Height, Axis::Component);
    assert_ne!(Axis::Width, Axis::Component);
    assert_ne!(Axis::Time, Axis::Component);
}

#[test]
fn frame_new_accepts_matching_length() {
    let pixels = [0.0f32; 12];
    let f = Frame::new(&pixels, 3, 4).expect("3x4 frame should accept 12 pixels");
    assert_eq!(f.height(), 3);
    assert_eq!(f.width(), 4);
    assert_eq!(f.pixels().len(), 12);
}

#[test]
fn frame_new_rejects_mismatched_length() {
    let pixels = [0.0f32; 11];
    let err = Frame::new(&pixels, 3, 4).unwrap_err();
    assert_eq!(
        err,
        ShapeError {
            expected: 12,
            actual: 11
        }
    );
}

#[test]
fn frame_new_rejects_zero_dims() {
    let pixels = [0.0f32; 0];
    assert!(Frame::new(&pixels, 0, 4).is_err());
    assert!(Frame::new(&pixels, 4, 0).is_err());
}

#[test]
fn frame_axes_are_height_then_width() {
    // Row-major: first axis = Height (y), second = Width (x).
    // This is the convention every downstream preprocess node relies on.
    let pixels = [0.0f32; 6];
    let f = Frame::new(&pixels, 2, 3).unwrap();
    assert_eq!(f.axes(), [Axis::Height, Axis::Width]);
}

#[test]
fn frame_get_is_row_major() {
    // Pixel layout for a 2x3 frame (H=2, W=3):
    //   index 0 1 2    row 0
    //   index 3 4 5    row 1
    let pixels: [f32; 6] = [10.0, 11.0, 12.0, 20.0, 21.0, 22.0];
    let f = Frame::new(&pixels, 2, 3).unwrap();
    assert_eq!(f.get(0, 0), 10.0);
    assert_eq!(f.get(0, 2), 12.0);
    assert_eq!(f.get(1, 0), 20.0);
    assert_eq!(f.get(1, 2), 22.0);
}

#[test]
fn frame_row_slice_returns_contiguous_row() {
    let pixels: [f32; 6] = [10.0, 11.0, 12.0, 20.0, 21.0, 22.0];
    let f = Frame::new(&pixels, 2, 3).unwrap();
    assert_eq!(f.row(0), &[10.0, 11.0, 12.0]);
    assert_eq!(f.row(1), &[20.0, 21.0, 22.0]);
}

#[test]
fn frame_mut_writes_propagate_to_backing_storage() {
    // FrameMut is the write-side view preprocess nodes will use for
    // in-place transforms. Setting a pixel must actually mutate the slice.
    let mut pixels: [f32; 4] = [0.0; 4];
    {
        let mut f = FrameMut::new(&mut pixels, 2, 2).unwrap();
        *f.get_mut(0, 1) = 3.5;
        *f.get_mut(1, 0) = 7.0;
    }
    assert_eq!(pixels, [0.0, 3.5, 7.0, 0.0]);
}

#[test]
fn frame_mut_row_slice_is_mutable() {
    let mut pixels: [f32; 6] = [0.0; 6];
    {
        let mut f = FrameMut::new(&mut pixels, 2, 3).unwrap();
        f.row_mut(1).copy_from_slice(&[9.0, 8.0, 7.0]);
    }
    assert_eq!(pixels, [0.0, 0.0, 0.0, 9.0, 8.0, 7.0]);
}
