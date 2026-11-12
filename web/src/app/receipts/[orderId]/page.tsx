"use client";

import { addressUrl, checkoutAbi, txUrl } from "@aevum-kit/aevum";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { formatUnits, isHash, isHex, type Hex } from "viem";
import { useReadContract, useTransactionReceipt } from "wagmi";
import { useToken } from "@/components/useToken";
import { appChain, checkoutAddress, hasExplorer } from "@/lib/env";
import { orderLabel } from "@/lib/order";

export default function ReceiptPage() {
  const params = useParams<{ orderId: string }>();
  const search = useSearchParams();
  const orderId = params.orderId;
  const tx = search.get("tx");
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
  const receipt = useTransactionReceipt({
    hash: tx && isHash(tx) ? tx : undefined,
    chainId: appChain.id,
    query: { enabled: Boolean(tx && isHash(tx)) },
  });

  if (!validOrder) {
    return (
      <main className="shell">
        <h1>Receipt not found</h1>
        <p className="lede">That order id isn&apos;t valid. Order ids are 32-byte hex values (0x + 64 characters).</p>
      </main>
    );
  }

  const p = payment.data;
  const paid = Boolean(p && p.payer !== "0x0000000000000000000000000000000000000000");

  return (
    <main className="shell" style={{ maxWidth: 760 }}>
      <div>
        <p className="eyebrow">Receipt · read from the chain</p>
        <h1>Order {orderLabel(orderId as Hex)}</h1>
      </div>

      <section className="card stack">
        {payment.isLoading ? (
          <p className="empty">Reading Checkout.paymentOf…</p>
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
              <span className="status-pill good">Paid</span>
              <span className="fine">{new Date(Number(p!.paidAt) * 1000).toLocaleString()}</span>
            </div>
            <div className="receipt-amount">
              {formatUnits(p!.amount, token.decimals)} <small style={{ fontSize: "0.4em", color: "var(--text-muted)" }}>{token.symbol}</small>
            </div>
            <dl className="kv">
              <dt>Order id</dt>
              <dd>{orderId}</dd>
              <dt>Payer</dt>
              <dd>{hasExplorer ? <a href={addressUrl(p!.payer)} target="_blank" rel="noreferrer">{p!.payer}</a> : p!.payer}</dd>
              <dt>Checkout</dt>
              <dd>{checkoutAddress}</dd>
              {receipt.data && (
                <>
                  <dt>Block</dt>
                  <dd>{receipt.data.blockNumber.toString()}</dd>
                  <dt>Gas used</dt>
                  <dd>{receipt.data.gasUsed.toString()}</dd>
                  <dt>Submitted by</dt>
                  <dd>{receipt.data.from}</dd>
                </>
              )}
              {tx && (
                <>
                  <dt>Transaction</dt>
                  <dd>{hasExplorer ? <a href={txUrl(tx)} target="_blank" rel="noreferrer">{tx}</a> : tx}</dd>
                </>
              )}
            </dl>
            {receipt.data && p && receipt.data.from.toLowerCase() !== p.payer.toLowerCase() && (
              <p className="fine">The payer didn&apos;t send this transaction: a relayer submitted the payer&apos;s signature (gasless mode).</p>
            )}
          </>
        )}
      </section>

      <p className="fine">
        This page trusts nothing but the chain: it calls <code>Checkout.paymentOf(orderId)</code>. Your backend can do the same before it ships an order.{" "}
        <Link href="/checkout">New order</Link>
      </p>
    </main>
  );
}
