/**
 * Player registry — single source of truth for which players are currently
 * shown in the overlay (keys are lowercased usernames). Remembers the name as
 * detected and its lookup source so a row can be re-fetched without losing
 * either. ADR-0003.
 */

export interface RegisteredPlayer {
    name: string;
    source: string;
}

export class PlayerRegistry {
    private players = new Map<string, RegisteredPlayer>();

    has(username: string): boolean {
        return this.players.has(username.toLowerCase());
    }

    /** Returns true if the player was newly added (an existing entry is kept as is) */
    add(username: string, source = 'manual'): boolean {
        const key = username.toLowerCase();
        if (this.players.has(key)) return false;
        this.players.set(key, { name: username, source });
        return true;
    }

    get(username: string): RegisteredPlayer | undefined {
        return this.players.get(username.toLowerCase());
    }

    /** Every registered player with its detected name and source */
    entries(): RegisteredPlayer[] {
        return [...this.players.values()];
    }

    /** Returns true if the player was present */
    delete(username: string): boolean {
        return this.players.delete(username.toLowerCase());
    }

    /** Removes every key not in `keep` (lowercased). Returns the removed keys. */
    clearExcept(keep: ReadonlySet<string>): string[] {
        const removed: string[] = [];
        for (const key of this.players.keys()) {
            if (!keep.has(key)) {
                this.players.delete(key);
                removed.push(key);
            }
        }
        return removed;
    }

    /** Removes everything. Returns the removed keys. */
    clear(): string[] {
        const removed = [...this.players.keys()];
        this.players.clear();
        return removed;
    }

    snapshot(): string[] {
        return [...this.players.keys()];
    }

    get size(): number {
        return this.players.size;
    }
}
