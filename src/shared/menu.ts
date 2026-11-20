/** Row context menu as the overlay renders it: plain serializable data, no click handlers. */

export type MenuTone = 'sniper' | 'cheater' | 'other' | 'danger';

export interface MenuItemView {
    /** Present on items the user can pick; handed back to main by `watchlist:menuPick` */
    id?: string;
    label: string;
    kind: 'action' | 'info' | 'separator' | 'submenu';
    tone?: MenuTone;
    checked?: boolean;
    items?: MenuItemView[];
}

export interface MenuView {
    /** Identifies this menu; only the latest token can pick */
    token: string;
    title: string;
    items: MenuItemView[];
}
