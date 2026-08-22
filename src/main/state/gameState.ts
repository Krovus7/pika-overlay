/**
 * Game state — tracks whether a BedWars match is in progress (in-game lock
 * for tab-list updates). ADR-0003.
 */

export class GameState {
    private inGame = false;

    setInGame(value: boolean): void {
        this.inGame = value;
    }

    isInGame(): boolean {
        return this.inGame;
    }
}
