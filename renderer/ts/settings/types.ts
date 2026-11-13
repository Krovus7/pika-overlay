import type { PikaOverlayApi } from '../../../src/shared/preload-api';
import type { Cfg } from './store';

/** One settings tab: its DOM, how it reflects the config, and show/hide hooks. */
export interface TabView {
    id: string;
    root: HTMLElement;
    sync(cfg: Cfg): void;
    show?(): void;
    hide?(): void;
}

export type TabBuilder = (api: PikaOverlayApi) => TabView;
