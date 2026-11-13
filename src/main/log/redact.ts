/**
 * Log lines are kept for the Debug tab and get copied into bug reports. Pika
 * answers `/apikey` in chat, so the key ends up in latest.log: hide it.
 */

const API_KEY_PATTERN = /pika_[A-Za-z0-9]{8,}/g;

export function redactSecrets(line: string): string {
    return line.replace(API_KEY_PATTERN, 'pika_<hidden>');
}
