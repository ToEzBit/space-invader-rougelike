export type ReadyFile = { status: 'ready'; url: string; buffer: AudioBuffer; gain: number };
export type LoadingFile = { status: 'loading'; attempt: number };
// retryAt is on the performance.now() clock, and null once every attempt has failed.
export type FailedFile = { status: 'failed'; attempt: number; tried: readonly string[]; retryAt: number | null };
export type FileLoad = { status: 'idle' } | LoadingFile | ReadyFile | FailedFile;

const FIRST_RETRY_MS = 2000;
const MAX_RETRY_MS = 60_000;
// About five minutes of retries after the first failure, so a connection that comes back mid-run still brings the
// song, and a file that never decodes is not downloaded again for the rest of the session.
export const MAX_ATTEMPTS = 10;

export function attemptDue(load: FileLoad, nowMs: number): LoadingFile | null {
  if (load.status === 'idle') return { status: 'loading', attempt: 1 };
  if (load.status === 'failed' && load.retryAt !== null && nowMs >= load.retryAt) return { status: 'loading', attempt: load.attempt + 1 };
  return null;
}

export function attemptFailed({ attempt }: LoadingFile, tried: readonly string[], nowMs: number): FailedFile {
  const retryAt = attempt < MAX_ATTEMPTS ? nowMs + Math.min(FIRST_RETRY_MS * 2 ** (attempt - 1), MAX_RETRY_MS) : null;
  return { status: 'failed', attempt, tried, retryAt };
}
