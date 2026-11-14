/** Pure window geometry (no Electron import, so it can be unit tested). */

export interface Rect { x: number; y: number; width: number; height: number }

/** Smallest overlay size at interface scale 1; the minimum grows with the scale. */
export const OVERLAY_BASE_MIN = { width: 360, height: 200 } as const;

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Resizes by newScale / oldScale with the top-left corner fixed, then keeps the
 * result inside the work area (shrinking first, shifting only if still needed).
 */
export function scaleBounds(bounds: Rect, oldScale: number, newScale: number, workArea: Rect): Rect {
    const ratio = newScale / oldScale;
    const width = Math.min(Math.round(bounds.width * ratio), workArea.width);
    const height = Math.min(Math.round(bounds.height * ratio), workArea.height);
    return {
        x: clamp(bounds.x, workArea.x, workArea.x + workArea.width - width),
        y: clamp(bounds.y, workArea.y, workArea.y + workArea.height - height),
        width,
        height,
    };
}

export function overlayMinSize(scale: number): { width: number; height: number } {
    return {
        width: Math.round(OVERLAY_BASE_MIN.width * scale),
        height: Math.round(OVERLAY_BASE_MIN.height * scale),
    };
}
