//! 3x3 median filter, used as the first defensive step in CaLa's
//! preprocess pipeline to kill sensor hot pixels and isolated impulses.

use crate::assets::{Frame, FrameMut, ShapeError};

/// Apply a 3x3 median filter from `input` into `output`.
///
/// Every output pixel is set to the median of its 3x3 neighborhood in the
/// input, with **replicate** boundary conditions on edges (out-of-bounds
/// coordinates clamp to the nearest valid pixel). Input and output must
/// have identical shape; returns `Err(ShapeError)` otherwise.
pub fn hot_pixel_median_3x3(input: Frame<'_>, output: &mut FrameMut<'_>) -> Result<(), ShapeError> {
    if input.height() != output.height() || input.width() != output.width() {
        return Err(ShapeError {
            expected: input.height() * input.width(),
            actual: output.pixels().len(),
        });
    }

    let h = input.height();
    let w = input.width();
    let h_last = h - 1;
    let w_last = w - 1;

    for y in 0..h {
        let y_up = y.saturating_sub(1);
        let y_dn = (y + 1).min(h_last);
        for x in 0..w {
            let x_lf = x.saturating_sub(1);
            let x_rt = (x + 1).min(w_last);

            let mut patch = [
                input.get(y_up, x_lf),
                input.get(y_up, x),
                input.get(y_up, x_rt),
                input.get(y, x_lf),
                input.get(y, x),
                input.get(y, x_rt),
                input.get(y_dn, x_lf),
                input.get(y_dn, x),
                input.get(y_dn, x_rt),
            ];
            *output.get_mut(y, x) = median9(&mut patch);
        }
    }
    Ok(())
}

/// Median of 9 f32s. Sorts in place (insertion sort is fastest at this size)
/// using total_cmp so the behavior is deterministic even if NaN slips in.
fn median9(buf: &mut [f32; 9]) -> f32 {
    for i in 1..9 {
        let mut j = i;
        while j > 0 && buf[j - 1].total_cmp(&buf[j]).is_gt() {
            buf.swap(j - 1, j);
            j -= 1;
        }
    }
    buf[4]
}
