/**
 * Player registry — single source of truth for which players are currently
 * shown in the overlay (keys are lowercased usernames). ADR-0003.
 */

export class PlayerRegistry {
    private keys = new Set<string>();

    has(username: string): boolean {
        return this.keys.has(username.toLowerCase());
    }

    /** Returns true if the player was newly added */
    add(username: string): boolean {
        const key = username.toLowerCase();
        if (this.keys.has(key)) return false;
        this.keys.add(key);
        return true;
    }

    /** Returns true if the player was present */
    delete(username: string): boolean {
        return this.keys.delete(username.toLowerCase());
    }

    /** Removes every key not in `keep` (lowercased). Returns the removed keys. */
    clearExcept(keep: ReadonlySet<string>): string[] {
        const removed: string[] = [];
        for (const key of this.keys) {
            if (!keep.has(key)) {
                this.keys.delete(key);
                removed.push(key);
            }
        }
        return removed;
    }

    /** Removes everything. Returns the removed keys. */
    clear(): string[] {
        const removed = [...this.keys];
        this.keys.clear();
        return removed;
    }

    snapshot(): string[] {
        return [...this.keys];
    }

    get size(): number {
        return this.keys.size;
    }
}
