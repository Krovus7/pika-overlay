/**
 * Membership oracle: which names the table SHOULD show, written only from the
 * intended rules (not from the app code). Consumes LogWatcher events.
 */

export const ORACLE_EVENTS = [
    'player_detected', 'player_quit', 'players_sync', 'players_clear', 'game_start', 'game_end',
    'party_joined', 'party_left', 'party_clear', 'party_members',
];

const lc = s => s.toLowerCase();

export class Oracle {
    constructor() {
        this.expected = new Set();
        this.party = new Set();
        this.matchStarted = false;
        this.eliminated = new Set();
        /** eliminated in this match and not re-detected by a non-tab source since */
        this.spectators = new Set();
    }

    keepOnly(pred) {
        for (const k of [...this.expected]) if (!pred(k)) this.expected.delete(k);
    }

    handle(ev, args) {
        switch (ev) {
            case 'player_detected': {
                const [name, source] = args;
                const k = lc(name);
                if (source === 'tab_list' && this.eliminated.has(k)) break;
                if (source !== 'tab_list') this.spectators.delete(k);
                this.expected.add(k);
                break;
            }
            case 'player_quit': {
                const k = lc(args[0]);
                if (this.matchStarted) { this.eliminated.add(k); this.spectators.add(k); }
                if (!this.party.has(k)) this.expected.delete(k);
                break;
            }
            case 'players_sync': {
                const names = new Set(args[0].map(lc));
                this.keepOnly(k => names.has(k) || this.party.has(k));
                break;
            }
            case 'game_start':
                this.matchStarted = true;
                this.eliminated.clear();
                this.spectators.clear();
                break;
            case 'players_clear':
                this.matchStarted = false;
                this.eliminated.clear();
                this.spectators.clear();
                this.keepOnly(k => this.party.has(k));
                break;
            case 'party_joined':
                this.party.add(lc(args[0]));
                this.expected.add(lc(args[0]));
                break;
            case 'party_left':
                this.party.delete(lc(args[0]));
                this.expected.delete(lc(args[0]));
                break;
            case 'party_clear':
                for (const k of this.party) this.expected.delete(k);
                this.party.clear();
                break;
            case 'party_members': {
                const names = args[0].map(lc);
                for (const k of this.party) if (!names.includes(k)) this.expected.delete(k);
                this.party = new Set(names);
                for (const k of names) this.expected.add(k);
                break;
            }
            default:
        }
    }

    /** Manual user actions */
    manualAdd(name) { this.expected.add(lc(name)); }
    manualClear() { this.keepOnly(k => this.party.has(k)); }
}
