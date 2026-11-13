import type { PikaOverlayApi } from '../../src/shared/preload-api';

declare global {
    /** Build-time constant injected by build.mjs */
    const __APP_VERSION__: string;
    interface Window {
        pikaOverlay: PikaOverlayApi;
        /** Dev/screenshot helpers (renderer/ts/demo/demo.ts) */
        __pikaDemo: () => void;
        __pikaDemoClear: () => void;
        __pikaDemoHealth: (kind: string) => void;
        __pikaDemoLayout: (layout: 'detailed' | 'compact') => void;
        __pikaDemoOpacity: (alpha: number) => void;
        __pikaDemoTheme: (theme: 'dark' | 'light') => void;
        __pikaDemoBackdrop: (scene: 'bright' | 'dark' | 'none') => void;
        __pikaDemoDensity: (dense: boolean) => void;
    }
}

export {};
