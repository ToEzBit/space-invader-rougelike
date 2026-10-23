// tried lists every source that failed in this attempt so far, with why.
export type Attempt = { attempt: number; tried: readonly string[] };
export type FetchingFile = { status: 'fetching'; url: string } & Attempt;
// The compressed bytes wait here until the run nears the song's fight, so its PCM is not held for the whole session.
export type FetchedFile = { status: 'fetched'; url: string; bytes: ArrayBuffer } & Attempt;
export type DecodingFile = { status: 'decoding'; url: string } & Attempt;
export type ReadyFile = { status: 'ready'; url: string; buffer: AudioBuffer; gain: number };
// retryAt is on the performance.now() clock, and null once every attempt has failed.
export type FailedFile = { status: 'failed'; retryAt: number | null } & Attempt;
export type FileLoad = { status: 'idle' } | FetchingFile | FetchedFile | DecodingFile | ReadyFile | FailedFile;

const FIRST_RETRY_MS = 2000;
const MAX_RETRY_MS = 60_000;
// About five minutes of retries after the first failure, so a connection that comes back mid-run still brings the
// song, and a file that never decodes is not downloaded again for the rest of the session.
export const MAX_ATTEMPTS = 10;

export function attemptDue(load: FileLoad, nowMs: number): Attempt | null {
  if (load.status === 'idle') return { attempt: 1, tried: [] };
  if (load.status === 'failed' && load.retryAt !== null && nowMs >= load.retryAt) return { attempt: load.attempt + 1, tried: [] };
  return null;
}

export function decodeDue(load: FileLoad, near: boolean): FetchedFile | null {
  return near && load.status === 'fetched' ? load : null;
}

export function attemptFailed({ attempt }: Attempt, tried: readonly string[], nowMs: number): FailedFile {
  const retryAt = attempt < MAX_ATTEMPTS ? nowMs + Math.min(FIRST_RETRY_MS * 2 ** (attempt - 1), MAX_RETRY_MS) : null;
  return { status: 'failed', attempt, tried, retryAt };
}
