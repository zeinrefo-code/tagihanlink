"use client";

import { checkoutAbi, getLogsChunked, txUrl } from "@aevum-kit/aevum";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { formatUnits, getAbiItem, type PublicClient } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { useToken } from "@/components/useToken";
import { useNetwork } from "@/lib/network";
import { orderLabel, short } from "@/lib/order";

const WINDOWS = [
  { blocks: 1_000n, label: "Last 1k blocks" },
  { blocks: 5_000n, label: "Last 5k blocks" },
  { blocks: 20_000n, label: "Last 20k blocks" },
];

export default function ActivityPage() {
  const { net } = useNetwork();
  const appChain = net.chain;
  const checkoutAddress = net.checkout;
  const deployBlock = net.deployBlock;
  const hasExplorer = net.hasExplorer;
  const client = usePublicClient({ chainId: appChain.id }) as PublicClient | undefined;
  const { address } = useAccount();
  const token = useToken();
  const [windowSize, setWindowSize] = useState(5_000n);
  const [onlyMine, setOnlyMine] = useState(false);
  const [progress, setProgress] = useState(0);

  const logs = useQuery({
    queryKey: ["paid-logs", appChain.id, checkoutAddress, windowSize.toString(), onlyMine ? address : null],
    enabled: Boolean(client && checkoutAddress),
    queryFn: async () => {
      const head = await client!.getBlockNumber();
      let from = head > windowSize ? head - windowSize + 1n : 0n;
      if (deployBlock !== undefined && deployBlock > from) from = deployBlock;
      setProgress(0);
      const result = await getLogsChunked(client!, {
        address: checkoutAddress!,
        event: getAbiItem({ abi: checkoutAbi, name: "Paid" }),
        args: onlyMine && address ? { payer: address } : undefined,
        fromBlock: from,
        toBlock: head,
        onProgress: (done, total) => setProgress(total ? Number((done * 100n) / total) : 100),
      });
      return { from, head, items: [...result].reverse() };
    },
  });

  const total = logs.data?.items.reduce((sum, l) => sum + (l.args.amount ?? 0n), 0n) ?? 0n;

  return (
    <main className="shell">
      <div className="page-head">
        <div>
          <p className="eyebrow">Example · reading events</p>
          <h1>Payment activity</h1>
          <p className="lede">
            Every <code>Paid</code> event from your Checkout. Aevum serves at most 1,000 blocks per <code>eth_getLogs</code> call, so the kit
            reads in chunks.
          </p>
        </div>
        {logs.data && (
          <div className="score">
            <span className="score-num">{logs.data.items.length}</span>
            <span className="fine">
              payments · {formatUnits(total, token.decimals)} {token.symbol}
            </span>
          </div>
        )}
      </div>

      {!checkoutAddress ? (
        <div className="card empty">
          No Checkout configured for {net.label}. Set <code>NEXT_PUBLIC_CHECKOUT_{net.key.toUpperCase()}</code> in <code>web/.env.local</code>.
        </div>
      ) : (
        <section className="card flush">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
            {WINDOWS.map((w) => (
              <button
                key={w.label}
                type="button"
                className={`btn small ${windowSize === w.blocks ? "" : "secondary"}`}
                aria-pressed={windowSize === w.blocks}
                onClick={() => setWindowSize(w.blocks)}
              >
                {w.label}
              </button>
            ))}
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center", marginLeft: "auto", fontSize: 14, color: "var(--text-muted)" }}>
              <input type="checkbox" checked={onlyMine} disabled={!address} onChange={(e) => setOnlyMine(e.target.checked)} />
              Only my payments
            </label>
          </div>

          {logs.isFetching && (
            <div style={{ padding: "16px 20px" }} aria-live="polite">
              <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${progress}%` }} />
              </div>
              <p className="fine" style={{ marginTop: 8 }}>
                Scanning {windowSize.toLocaleString("en-US")} blocks, 1,000 at a time… {progress}%
              </p>
            </div>
          )}

          {logs.error && <p className="empty">Couldn&apos;t read events: {(logs.error as Error).message}</p>}

          {logs.data && logs.data.items.length === 0 && !logs.isFetching && (
            <p className="empty">
              No payments in blocks {logs.data.from.toString()}–{logs.data.head.toString()}. <Link href="/checkout">Make one</Link>.
            </p>
          )}

          {logs.data && logs.data.items.length > 0 && (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Payer</th>
                    <th className="right">Amount</th>
                    <th className="right">Block</th>
                    <th>Links</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.data.items.map((l) => (
                    <tr key={`${l.transactionHash}-${l.logIndex}`}>
                      <td className="mono">{l.args.orderId ? orderLabel(l.args.orderId) : "—"}</td>
                      <td className="mono">{short(l.args.payer ?? "")}</td>
                      <td className="right num">
                        {formatUnits(l.args.amount ?? 0n, token.decimals)} {token.symbol}
                      </td>
                      <td className="right num">{l.blockNumber?.toString()}</td>
                      <td style={{ display: "flex", gap: 14 }}>
                        <Link href={`/receipts/${l.args.orderId}?tx=${l.transactionHash}&chain=${appChain.id}`}>Receipt</Link>
                        {hasExplorer && l.transactionHash && (
                          <a href={txUrl(l.transactionHash)} target="_blank" rel="noreferrer">
                            Tx
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
