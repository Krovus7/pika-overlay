/**
 * Party line parsing — ported 1:1 from pika-overlay-v3/src/logWatcher.js
 * `_tryPartyEvent` and `_tryPartyMemberList`.
 *
 * Holds the pending-owner buffer (an owner seen on an "Owner:" line is joined
 * with the next "Members:" line into a single party_members event).
 * All "Party ..." prefixed lines are consumed here and never reach the tab-list
 * detector (HANDOVER v2.7 rule).
 */

import {
    RE_PARTY_DISBAND, RE_PARTY_JOINED, RE_PARTY_KICKED, RE_PARTY_LEFT,
    RE_PARTY_MEMBERS, RE_PARTY_OWNER, RE_MEMBER_LIST, RE_MC_NAME,
} from './patterns';
import { cleanName, isCommonWord } from './nameCleaner';

export type EmitFn = (event: string, ...args: unknown[]) => void;

export class PartyParser {
    private pendingOwner: string | null = null;

    constructor(private readonly emit: EmitFn) {}

    /** True if the line was fully consumed by party logic */
    tryEvent(msg: string): boolean {
        const ownerM = RE_PARTY_OWNER.exec(msg);
        if (ownerM) {
            const name = cleanName(ownerM[1]!.trim());
            if (name && RE_MC_NAME.test(name) && !isCommonWord(name)) {
                this.pendingOwner = name;
                console.log(`[LogWatcher] party owner buffered (in party event): ${name}`);
                this.emit('party_joined', name);
            }
            return true;
        }

        const membersM = RE_PARTY_MEMBERS.exec(msg) || RE_MEMBER_LIST.exec(msg);
        if (membersM) {
            const names = membersM[1]!
                .split(',')
                .map(s => cleanName(s.trim()))
                .filter((n): n is string => !!n && RE_MC_NAME.test(n) && !isCommonWord(n));

            if (names.length === 0) {
                console.log('[LogWatcher] member line matched but no valid names — preserving pending owner:', this.pendingOwner);
                return true;
            }

            const owner = this.pendingOwner;
            this.pendingOwner = null;

            const allMembers = owner
                ? [owner, ...names.filter(n => n.toLowerCase() !== owner.toLowerCase())]
                : names;

            if (allMembers.length >= 2 || (owner && names.length >= 1)) {
                this.emit('party_members', allMembers);
            } else if (names.length > 0) {
                this.emit('party_members', names);
            }
            return true;
        }

        const joinM = RE_PARTY_JOINED.exec(msg);
        if (joinM) {
            this.emit('party_joined', joinM[1]);
            return true;
        }

        // Order is critical: disband/self-leave BEFORE the leave regex, otherwise
        // "You have left the party" matches RE_PARTY_LEFT with "have" as username.
        if (RE_PARTY_DISBAND.test(msg)) {
            this.emit('party_clear');
            return true;
        }

        const leftM = RE_PARTY_LEFT.exec(msg);
        if (leftM) {
            this.emit('party_left', leftM[1]);
            return true;
        }

        const kickM = RE_PARTY_KICKED.exec(msg);
        if (kickM) {
            this.emit('party_left', kickM[1]);
            return true;
        }

        return true;
    }

    /** /p info member list lines that do NOT start with "Party" */
    tryMemberList(msg: string): boolean {
        const ownerM = RE_PARTY_OWNER.exec(msg);
        if (ownerM) {
            const name = cleanName(ownerM[1]!.trim());
            if (name && RE_MC_NAME.test(name) && !isCommonWord(name)) {
                this.pendingOwner = name;
                console.log(`[LogWatcher] party owner buffered (non-party line): ${name}`);
                this.emit('party_joined', name);
            }
            return true;
        }

        const m = RE_MEMBER_LIST.exec(msg);
        if (!m) return false;

        const names = m[1]!
            .split(',')
            .map(s => cleanName(s.trim()))
            .filter((n): n is string => !!n && RE_MC_NAME.test(n) && !isCommonWord(n));

        if (names.length === 0) {
            console.log('[LogWatcher] member line (non-party) matched but no valid names — preserving pending owner:', this.pendingOwner);
            return true;
        }

        const owner = this.pendingOwner;
        this.pendingOwner = null;

        const allMembers = owner
            ? [owner, ...names.filter(n => n.toLowerCase() !== owner.toLowerCase())]
            : names;

        if (allMembers.length >= 2 || (owner && names.length >= 1)) {
            this.emit('party_members', allMembers);
            return true;
        }
        return false;
    }
}
