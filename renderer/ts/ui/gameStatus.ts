/** Title bar game-status pill (idle / in queue / in game). */

const pill = document.getElementById('status-badge') as HTMLElement;

export type GamePhase = 'idle' | 'queue' | 'game';

export function setGameStatus(phase: GamePhase, text: string): void {
    pill.textContent = text;
    pill.className = `status-pill is-${phase}`;
}

export function showFatal(text: string): void {
    pill.textContent = text;
    pill.className = 'status-pill is-queue';
}
