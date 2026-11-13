/** Small shared helpers: seeded PRNG, string hashing, virtual-clock formatting. */

export function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function hash32(str, seed = 1) {
    let h = (2166136261 ^ seed) >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
    return h >>> 0;
}

/** Deterministic value in [0, 1) for a string */
export const unit = (str, seed = 1) => hash32(str, seed) / 4294967296;

/** HH:MM:SS of a (virtual) epoch ms, UTC */
export const hms = ms => new Date(ms).toISOString().slice(11, 19);

/** Lets every pending promise continuation run (setImmediate is not mocked) */
export async function flush() {
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
}

export function percentile(sorted, p) {
    if (sorted.length === 0) return null;
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

export function summarize(samples) {
    const s = [...samples].sort((a, b) => a - b);
    return { n: s.length, p50: percentile(s, 0.5), p95: percentile(s, 0.95), max: s.length ? s[s.length - 1] : null };
}
