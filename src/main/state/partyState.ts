/**
 * Party state — current party members (lowercased keys). Members are pinned:
 * never removed via kill feed, survives players_clear. ADR-0003.
 */

export class PartyState {
    private members = new Set<string>();

    add(username: string): void {
        this.members.add(username.toLowerCase());
    }

    delete(username: string): boolean {
        return this.members.delete(username.toLowerCase());
    }

    has(username: string): boolean {
        return this.members.has(username.toLowerCase());
    }

    clear(): void {
        this.members.clear();
    }

    snapshot(): string[] {
        return [...this.members];
    }

    get size(): number {
        return this.members.size;
    }
}
