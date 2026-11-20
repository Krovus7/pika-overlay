/** Where the row menu goes so it stays fully inside the window. Pure. */

export interface PlaceInput {
    /** Cursor position in the viewport */
    x: number;
    y: number;
    /** Natural size of the menu */
    width: number;
    height: number;
    viewWidth: number;
    viewHeight: number;
    margin: number;
}

export interface Placement {
    left: number;
    top: number;
    /** Set when the menu is taller than the window; the menu then scrolls inside */
    maxHeight: number;
}

/** Opens toward the free side of the cursor: flips when the preferred side overflows, then clamps. */
function axis(pos: number, size: number, view: number, margin: number): number {
    const max = view - margin - size;
    const start = pos + size > view - margin && pos - size >= margin ? pos - size : pos;
    return Math.max(margin, Math.min(start, max));
}

export function placeMenu(p: PlaceInput): Placement {
    const maxHeight = Math.max(0, p.viewHeight - 2 * p.margin);
    const width = Math.min(p.width, Math.max(0, p.viewWidth - 2 * p.margin));
    const height = Math.min(p.height, maxHeight);
    return {
        left: axis(p.x, width, p.viewWidth, p.margin),
        top: axis(p.y, height, p.viewHeight, p.margin),
        maxHeight,
    };
}

/** Next index when moving the highlight over `count` items; wraps. `current` -1 means none. */
export function stepIndex(count: number, current: number, dir: 1 | -1): number {
    if (count === 0) return -1;
    if (current < 0) return dir > 0 ? 0 : count - 1;
    return ((current + dir) % count + count) % count;
}
