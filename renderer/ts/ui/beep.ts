/** A short built-in beep (Web Audio, no file) for the watchlist alert. */

let audio: AudioContext | null = null;

export function playBeep(): void {
    try {
        audio ??= new AudioContext();
        void audio.resume();
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        const t0 = audio.currentTime;
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.15, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
        osc.connect(gain).connect(audio.destination);
        osc.start(t0);
        osc.stop(t0 + 0.28);
    } catch (err) {
        console.error('[Overlay] Beep failed:', String(err));
    }
}
