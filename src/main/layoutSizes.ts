/** Per-layout window sizes (pure, no Electron import so it can be unit tested). */

import { overlayMinSize, type Rect } from './windowBounds';

export type LayoutMode = 'detailed' | 'compact';
export interface Size { width: number; height: number }
export type OverlaySizes = Record<LayoutMode, Size | null>;

export const EMPTY_SIZES: OverlaySizes = { detailed: null, compact: null };

function normalizeSize(v: unknown): Size | null {
    if (!v || typeof v !== 'object') return null;
    const { width, height } = v as Record<string, unknown>;
    const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
    return valid(width) && valid(height) ? { width, height } : null;
}

export function normalizeOverlaySizes(v: unknown): OverlaySizes {
    const raw = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    return { detailed: normalizeSize(raw.detailed), compact: normalizeSize(raw.compact) };
}

export function withSize(sizes: OverlaySizes, mode: LayoutMode, bounds: Size): OverlaySizes {
    return { ...sizes, [mode]: { width: bounds.width, height: bounds.height } };
}

export function scaleSizes(sizes: OverlaySizes, oldScale: number, newScale: number): OverlaySizes {
    const ratio = newScale / oldScale;
    const scale = (s: Size | null): Size | null =>
        s && { width: Math.round(s.width * ratio), height: Math.round(s.height * ratio) };
    return { detailed: scale(sizes.detailed), compact: scale(sizes.compact) };
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Bounds for the layout just switched to: the saved size with the top-left kept,
 * never below the minimum, shrunk and shifted into the work area. Null when the
 * layout has no saved size (the window keeps its current size).
 */
export function boundsForLayout(current: Rect, saved: Size | null, scale: number, workArea: Rect): Rect | null {
    if (!saved) return null;
    const min = overlayMinSize(scale);
    const width = Math.min(Math.max(saved.width, min.width), workArea.width);
    const height = Math.min(Math.max(saved.height, min.height), workArea.height);
    return {
        x: clamp(current.x, workArea.x, workArea.x + workArea.width - width),
        y: clamp(current.y, workArea.y, workArea.y + workArea.height - height),
        width,
        height,
    };
}
