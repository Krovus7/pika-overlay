/** Turns a MenuSpec into the serializable view and keeps the click closures of the latest menu only. */

import { randomUUID } from 'node:crypto';

import type { MenuItemView, MenuView } from '../../shared/menu';
import type { MenuSpec } from './menuSpec';

export class MenuSession {
    private token = '';
    private actions = new Map<string, () => boolean>();

    /** Starts a new menu; every earlier token stops working. */
    open(title: string, specs: readonly MenuSpec[]): MenuView {
        this.token = randomUUID();
        this.actions = new Map();
        return { token: this.token, title, items: specs.map(spec => this.view(spec)) };
    }

    /** Runs the picked action if the token is the latest, then forgets the menu. The action's result; false for a stale token or unknown id. */
    pick(token: unknown, id: unknown): boolean {
        if (typeof token !== 'string' || typeof id !== 'string' || token !== this.token) return false;
        const action = this.actions.get(id);
        this.token = '';
        this.actions = new Map();
        if (!action) return false;
        return action();
    }

    private view(spec: MenuSpec): MenuItemView {
        const item: MenuItemView = { label: spec.label, kind: spec.kind };
        if (spec.tone) item.tone = spec.tone;
        if (spec.checked) item.checked = true;
        if (spec.items) item.items = spec.items.map(sub => this.view(sub));
        if (spec.click) {
            item.id = `a${this.actions.size}`;
            this.actions.set(item.id, spec.click);
        }
        return item;
    }
}
