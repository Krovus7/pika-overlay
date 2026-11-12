import type { PikaOverlayApi } from '../../src/shared/preload-api';

declare global {
    interface Window {
        pikaOverlay: PikaOverlayApi;
        /** Dev/screenshot helpers (renderer/ts/demo/demo.ts) */
        __pikaDemo: () => void;
        __pikaDemoClear: () => void;
        __pikaDemoHealth: (kind: string) => void;
        __pikaDemoLayout: (layout: 'detailed' | 'compact') => void;
        __pikaDemoOpacity: (alpha: number, contrast?: 'dark' | 'light') => void;
        __pikaDemoDensity: (dense: boolean) => void;
    }
}

export {};
