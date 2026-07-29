import { createHash } from 'node:crypto';

export function deriveStage1PkceS256Challenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
