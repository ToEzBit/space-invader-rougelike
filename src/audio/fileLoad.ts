// attempt counts every attempt this session, so attempt 1 is still the very first try after a rearm. firstOfRound is
// the attempt the current round of retries began at, which restarts the schedule and the cap. tried lists every
// source that failed in this attempt so far, with why.
export type Attempt = { attempt: number; firstOfRound: number; tried: readonly string[] };
export type FetchingFile = { status: 'fetching'; url: string } & Attempt;
// The compressed bytes wait here until the run nears the song's fight, so its PCM is not held for the whole session.
export type FetchedFile = { status: 'fetched'; url: string; bytes: ArrayBuffer } & Attempt;
export type DecodingFile = { status: 'decoding'; url: string } & Attempt;
export type ReadyFile = { status: 'ready'; url: string; buffer: AudioBuffer; gain: number };
// retryAt is on the performance.now() clock, and null once every attempt of the round has failed.
export type FailedFile = { status: 'failed'; retryAt: number | null } & Attempt;
export type FileLoad = { status: 'idle' } | FetchingFile | FetchedFile | DecodingFile | ReadyFile | FailedFile;

const FIRST_RETRY_MS = 2000;
const MAX_RETRY_MS = 60_000;
// About five minutes of retries after the first failure, so a connection that comes back mid-run still brings the
// song, and a file that never decodes is not downloaded again until its fight asks for it.
export const MAX_ATTEMPTS = 10;

export function attemptDue(load: FileLoad, nowMs: number): Attempt | null {
  if (load.status === 'idle') return { attempt: 1, firstOfRound: 1, tried: [] };
  if (load.status === 'failed' && load.retryAt !== null && nowMs >= load.retryAt) return { attempt: load.attempt + 1, firstOfRound: load.firstOfRound, tried: [] };
  return null;
}

export function decodeDue(load: FileLoad, near: boolean): FetchedFile | null {
  return near && load.status === 'fetched' ? load : null;
}

export function attemptFailed({ attempt, firstOfRound }: Attempt, tried: readonly string[], nowMs: number): FailedFile {
  const ofRound = attempt - firstOfRound + 1;
  const retryAt = ofRound < MAX_ATTEMPTS ? nowMs + Math.min(FIRST_RETRY_MS * 2 ** (ofRound - 1), MAX_RETRY_MS) : null;
  return { status: 'failed', attempt, firstOfRound, tried, retryAt };
}

// For the moment the song's fight starts asking for it: a load that has given up starts a fresh round at once.
export function rearmed(load: FileLoad, nowMs: number): FileLoad {
  return load.status === 'failed' && load.retryAt === null ? { ...load, firstOfRound: load.attempt + 1, retryAt: nowMs } : load;
}
