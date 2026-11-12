import type { AbiEvent, Address, GetLogsReturnType, PublicClient } from "viem";
import { MAX_LOG_RANGE } from "./chain";

export interface ChunkedLogsArgs<E extends AbiEvent> {
  address: Address;
  event: E;
  args?: Record<string, unknown>;
  fromBlock: bigint;
  toBlock?: bigint;
  /** Blocks per request. Aevum rejects more than 1,000. */
  step?: bigint;
  /** Called after each chunk; handy for a progress bar. */
  onProgress?: (done: bigint, total: bigint) => void;
}

/**
 * eth_getLogs over any range, split into ≤1,000-block requests (Aevum's limit).
 * Requests run one after another to stay friendly with the public RPC.
 */
export async function getLogsChunked<E extends AbiEvent>(
  client: PublicClient,
  { address, event, args, fromBlock, toBlock, step = MAX_LOG_RANGE, onProgress }: ChunkedLogsArgs<E>,
): Promise<GetLogsReturnType<E>> {
  if (step < 1n || step > MAX_LOG_RANGE) throw new Error(`step must be between 1 and ${MAX_LOG_RANGE}`);
  const end = toBlock ?? (await client.getBlockNumber());
  const total = end >= fromBlock ? end - fromBlock + 1n : 0n;
  const out: unknown[] = [];
  for (let start = fromBlock; start <= end; start += step) {
    const stop = start + step - 1n > end ? end : start + step - 1n;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logs = await client.getLogs({ address, event, args, fromBlock: start, toBlock: stop } as any);
    out.push(...logs);
    onProgress?.(stop - fromBlock + 1n, total);
  }
  return out as GetLogsReturnType<E>;
}
