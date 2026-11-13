/**
 * Ring of the most recent log lines (secrets redacted) for the settings
 * panel's debug view. Kept free of Electron imports so the log pipeline can
 * run in plain Node (headless simulator).
 */

import { redactSecrets } from './redact';

const MAX_LOG_LINES = 100;
const recentLogLines: string[] = [];

export function pushLogLine(line: string): void {
    recentLogLines.push(redactSecrets(line));
    if (recentLogLines.length > MAX_LOG_LINES) recentLogLines.shift();
}

export function getRecentLogLines(): string[] {
    return [...recentLogLines];
}
