"use client";

import { addressUrl, checkoutAbi, txUrl } from "@aevum-kit/aevum";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { formatUnits, isHash, isHex, parseEventLogs, parseUnits, type Hex } from "viem";
import { useReadContract, useTransactionReceipt } from "wagmi";
import { useToken } from "@/components/useToken";
import { networkByChainId } from "@/lib/env";
import { useNetwork } from "@/lib/network";
import { orderLabel, priceOf } from "@/lib/order";

const ZERO = "0x0000000000000000000000000000000000000000";

export default function ReceiptPage() {
  const { net: appNet } = useNetwork();
  const params = useParams<{ orderId: string }>();
  const search = useSearchParams();
  // Receipt links carry their chain, so they still work after you switch networks.
  const net = networkByChainId(Number(search.get("chain"))) ?? appNet;
  const appChain = net.chain;
  const checkoutAddress = net.checkout;
  const hasExplorer = net.hasExplorer;
  const orderId = params.orderId;
  const rawTx = search.get("tx");
  // Anything else in ?tx= is ignored, never shown: a receipt must not display text from the URL.
  const tx = rawTx && isHash(rawTx) ? rawTx : undefined;
  const validOrder = isHex(orderId) && orderId.length === 66;
  const token = useToken();

  const payment = useReadContract({
    address: checkoutAddress,
    abi: checkoutAbi,
    functionName: "paymentOf",
    args: validOrder ? [orderId as Hex] : undefined,
    chainId: appChain.id,
    query: { enabled: validOrder && Boolean(checkoutAddress) },
  });
  const receipt = useTransactionReceipt({ hash: tx, chainId: appChain.id, query: { enabled: Boolean(tx) } });

  if (!validOrder) {
    return (
      <main className="shell">
        <h1>Receipt not found</h1>
        <p className="lede">That order id isn&apos;t valid. Order ids are 32-byte hex values (0x + 64 characters).</p>
      </main>
    );
  }

  const p = payment.data;
  const paid = Boolean(p && p.payer !== ZERO);
  // Anyone can call pay(orderId, amount) with any amount, so "paid" alone proves nothing.
  // Check the amount against what the order costs before you treat it as settled.
  const expected = parseUnits(priceOf(orderId as Hex), token.decimals);
  const fullyPaid = paid && p!.amount === expected;
  // Only show transaction details if that transaction really emitted Paid for this order.
  const paidLog =
    receipt.data && checkoutAddress
      ? parseEventLogs({ abi: checkoutAbi, logs: receipt.data.logs, eventName: "Paid" }).find(
          (l) => l.address.toLowerCase() === checkoutAddress.toLowerCase() && l.args.orderId.toLowerCase() === orderId.toLowerCase(),
        )
      : undefined;
  const txMatches = Boolean(paidLog);

  return (
    <main className="shell" style={{ maxWidth: 760 }}>
      <div>
        <p className="eyebrow">Receipt · read from {appChain.name}</p>
        <h1>Order {orderLabel(orderId as Hex)}</h1>
      </div>

      <section className="card stack">
        {!checkoutAddress ? (
          <div className="stack">
            <span className="status-pill warn">Can&apos;t check</span>
            <p style={{ color: "var(--text-muted)" }}>No Checkout is configured for {appChain.name} in this app.</p>
          </div>
        ) : payment.isLoading ? (
          <p className="empty">Reading Checkout.paymentOf…</p>
        ) : payment.isError ? (
          <div className="stack">
            <span className="status-pill warn">Can&apos;t check</span>
            <p style={{ color: "var(--text-muted)" }}>
              Couldn&apos;t read the payment from {appChain.name}. The RPC may be busy.{" "}
              <button type="button" className="btn small" onClick={() => payment.refetch()}>
                Try again
              </button>
            </p>
          </div>
        ) : !paid ? (
          <div className="stack">
            <span className="status-pill warn">Not paid</span>
            <p style={{ color: "var(--text-muted)" }}>
              No payment is recorded for this order on {appChain.name}. If you just paid, wait a few seconds and refresh.
            </p>
          </div>
        ) : (
          <>
            <div className="check-top" style={{ alignItems: "center" }}>
              <span className={`status-pill ${fullyPaid ? "good" : "warn"}`}>{fullyPaid ? "Paid" : "Wrong amount"}</span>
              <span className="fine">{new Date(Number(p!.paidAt) * 1000).toLocaleString()}</span>
            </div>
            <div className="receipt-amount">
              {formatUnits(p!.amount, token.decimals)} <small style={{ fontSize: "0.4em", color: "var(--text-muted)" }}>{token.symbol}</small>
            </div>
            {!fullyPaid && (
              <p className="fine">
                This order costs {formatUnits(expected, token.decimals)} {token.symbol}, but {formatUnits(p!.amount, token.decimals)} was
                paid. Don&apos;t treat it as settled.
              </p>
            )}
            <dl className="kv">
              <dt>Order id</dt>
              <dd>{orderId}</dd>
              <dt>Payer</dt>
              <dd>{hasExplorer ? <a href={addressUrl(p!.payer)} target="_blank" rel="noreferrer">{p!.payer}</a> : p!.payer}</dd>
              <dt>Checkout</dt>
              <dd>{checkoutAddress}</dd>
              {txMatches && receipt.data && (
                <>
                  <dt>Block</dt>
                  <dd>{receipt.data.blockNumber.toString()}</dd>
                  <dt>Gas used</dt>
                  <dd>{receipt.data.gasUsed.toString()}</dd>
                  <dt>Submitted by</dt>
                  <dd>{receipt.data.from}</dd>
                  <dt>Transaction</dt>
                  <dd>{hasExplorer ? <a href={txUrl(tx!)} target="_blank" rel="noreferrer">{tx}</a> : tx}</dd>
                </>
              )}
            </dl>
            {tx && receipt.data && !txMatches && (
              <p className="fine">The transaction in this link isn&apos;t the payment for this order, so it isn&apos;t shown.</p>
            )}
            {txMatches && receipt.data && p && receipt.data.from.toLowerCase() !== p.payer.toLowerCase() && (
              <p className="fine">The payer didn&apos;t send this transaction: a relayer submitted the payer&apos;s signature (gasless mode).</p>
            )}
          </>
        )}
      </section>

      <p className="fine">
        This page trusts nothing but the chain: it calls <code>Checkout.paymentOf(orderId)</code> and checks the amount. Your backend should
        do the same before it ships an order. <Link href="/checkout">New order</Link>
      </p>
    </main>
  );
}
