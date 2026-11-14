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

const SIDE_GAP = 8;

/** Opens next to the overlay: right if it fits, else left, else centered in the work area. */
export function placeBeside(overlay: Rect, size: { width: number; height: number }, workArea: Rect): Rect {
    const width = Math.min(size.width, workArea.width);
    const height = Math.min(size.height, workArea.height);
    const y = clamp(overlay.y, workArea.y, workArea.y + workArea.height - height);
    const right = overlay.x + overlay.width + SIDE_GAP;
    if (right + width <= workArea.x + workArea.width) return { x: right, y, width, height };
    const left = overlay.x - SIDE_GAP - width;
    if (left >= workArea.x) return { x: left, y, width, height };
    return {
        x: Math.round(workArea.x + (workArea.width - width) / 2),
        y: Math.round(workArea.y + (workArea.height - height) / 2),
        width,
        height,
    };
}

/** True when the whole rectangle lies inside at least one of the work areas. */
export function isInsideAny(bounds: Rect, workAreas: readonly Rect[]): boolean {
    return workAreas.some(area =>
        bounds.x >= area.x && bounds.y >= area.y
        && bounds.x + bounds.width <= area.x + area.width
        && bounds.y + bounds.height <= area.y + area.height);
}
