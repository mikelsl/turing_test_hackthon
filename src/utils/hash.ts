import { createHash } from 'node:crypto';

export function sha256Json(value: unknown): string {
  return '0x' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
