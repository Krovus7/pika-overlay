/**
 * Game state — whether a BedWars match is running, and who has been
 * eliminated in it. ADR-0003, ADR-0012.
 *
 * Eliminated players stay on the server as spectators, so they still show up
 * in a tab roster; remembering them keeps a roster from bringing them back.
 * The list lives from the match start until the lobby changes (not until
 * game_end: that also fires for messages that do not end the match).
 */

export class GameState {
    private inGame = false;
    private matchStarted = false;
    private readonly eliminated = new Set<string>();

    startGame(): void {
        this.inGame = true;
        this.matchStarted = true;
        this.eliminated.clear();
    }

    endGame(): void {
        this.inGame = false;
    }

    /** The lobby changed: nothing of the previous match applies any more. */
    reset(): void {
        this.inGame = false;
        this.matchStarted = false;
        this.eliminated.clear();
    }

    isInGame(): boolean {
        return this.inGame;
    }

    /** Records a player who left the table; only counts once a match has started. */
    markEliminated(username: string): void {
        if (this.matchStarted) this.eliminated.add(username.toLowerCase());
    }

    isEliminated(username: string): boolean {
        return this.eliminated.has(username.toLowerCase());
    }
}
