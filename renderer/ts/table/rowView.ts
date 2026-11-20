/** Per-row facts (name, party/self/suspect flags) and the signature that tells when a row must re-render. Pure. */

import { chipsSignature, viewChips } from './tagsCell';
import { loginAgeView } from './loginAge';
import type { RenderContext, RowData, RowView } from './types';

/** Level 0/1 with zero stats: likely a bot or a fresh alt. */
function isSuspect(d: RowData): boolean {
    return d.status === 'ok'
        && (d.level === 0 || d.level === 1)
        && d.finalKills === 0 && d.kills === 0 && d.wins === 0;
}

export function selfKey(ctx: Pick<RenderContext, 'isNicked' | 'myNickName' | 'myUsername'>): string {
    return ctx.isNicked && ctx.myNickName ? ctx.myNickName : ctx.myUsername;
}

/** When the user is nicked, the overlay shows their real name instead of the nick. */
function displayName(d: RowData, ctx: RenderContext): string {
    if (ctx.isNicked && ctx.myNickName && ctx.myUsername && d.username.toLowerCase() === ctx.myNickName) {
        return ctx.myUsername.charAt(0).toUpperCase() + ctx.myUsername.slice(1);
    }
    return d.username;
}

function ageOf(d: RowData, ctx: RenderContext): RowView['age'] {
    if (d.status !== 'ok' && d.status !== 'api_off' && d.status !== 'never_played' && d.status !== 'no_data') return null;
    return loginAgeView(d.lastSeen, d.level, ctx.now, ctx.loginAge);
}

export function viewOf(d: RowData, ctx: RenderContext): RowView {
    const key = d.username.toLowerCase();
    const self = selfKey(ctx);
    return {
        data: d,
        name: displayName(d, ctx),
        isParty: ctx.partyMembers.has(key),
        isSelf: !!self && key === self,
        isSuspect: ctx.highlightSuspects && isSuspect(d),
        age: ageOf(d, ctx),
    };
}

/** Fingerprint of everything besides the data object that changes a row's markup. */
export function viewSignature(v: RowView): string {
    return `${v.name}|${+v.isParty}${+v.isSelf}${+v.isSuspect}|${v.age?.text ?? ''}|${chipsSignature(viewChips(v))}`;
}
