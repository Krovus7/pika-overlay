/** Legend of the row status pills, rendered with the overlay's own pill styles. */

import { STATUS_STYLES } from '../table/statusRow';
import { group, h, svgIcon } from './controls';

interface LegendEntry { status: string; meaning: string; certainty: string }

const ENTRIES: LegendEntry[] = [
    { status: 'nicked', certainty: 'Very likely',
      meaning: 'The name does not exist on Pika, yet the player is in your game. They are using a nick.' },
    { status: 'not_found', certainty: 'Unsure',
      meaning: 'A name you typed that Pika does not know. A typo, or someone who is nicked.' },
    { status: 'api_off', certainty: 'Certain',
      meaning: 'The player set their stats to private. Pika\'s API says so directly.' },
    { status: 'never_played', certainty: 'Likely',
      meaning: 'Public profile that never played BedWars. Usually a new account or an alt.' },
    { status: 'no_data', certainty: 'Certain',
      meaning: 'Has BedWars stats, but none in the period or mode selected at the top. Try All Time.' },
    { status: 'error', certainty: 'Temporary',
      meaning: 'The lookup failed (timeout or server error). It is not a key problem. Use Retry.' },
    { status: 'rate_limited', certainty: 'Temporary',
      meaning: 'Pika\'s request limit was reached. The overlay retries on its own.' },
    { status: 'auth', certainty: 'Fix needed',
      meaning: 'No API key is saved, or Pika rejected it. Add or replace the key above.' },
];

export function buildStatusLegend(): HTMLElement {
    const { root, list } = group('What the row labels mean',
        'Rows that cannot show stats get a label instead. This is how sure each one is.');
    for (const entry of ENTRIES) {
        const style = STATUS_STYLES[entry.status];
        if (!style) continue;
        const item = h('div', 's-legend-row');
        const pill = h('span', `pill pill-${style.tone}`);
        pill.append(svgIcon(style.icon), h('span', 'pill-label', style.label));
        const text = h('p', 's-legend-text', entry.meaning);
        text.append(h('span', 's-legend-sure', `Confidence: ${entry.certainty}`));
        item.append(pill, text);
        list.appendChild(item);
    }
    return root;
}
