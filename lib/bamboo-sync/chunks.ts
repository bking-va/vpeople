export const BAMBOO_WRITE_CHUNK_SIZE = 500;
/** Must match the literal SET LOCAL statement_timeout in applyBambooWriteGuards. */
export const BAMBOO_STATEMENT_TIMEOUT = "60s";
/** Must match the literal SET LOCAL idle_in_transaction_session_timeout. */
export const BAMBOO_IDLE_IN_TX_TIMEOUT = "180s";
/** Must match the literal SET LOCAL lock_timeout. */
export const BAMBOO_LOCK_TIMEOUT = "15s";

export type BatchProgress = {
  chunkSize?: number;
  onProgress?: (done: number, total: number) => void;
};

export function chunkRows<T>(
  rows: readonly T[],
  size: number = BAMBOO_WRITE_CHUNK_SIZE
): T[][] {
  const chunkSize = Math.max(1, size);
  if (rows.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize) as T[]);
  }
  return chunks;
}

export function reportChunkProgress(
  progress: BatchProgress | undefined,
  done: number,
  total: number
): void {
  progress?.onProgress?.(done, total);
}
