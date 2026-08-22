import type { PikaOverlayApi } from '../../src/shared/preload-api';

declare global {
    interface Window {
        pikaOverlay: PikaOverlayApi;
    }
}

export {};
