"use client";

import { authorizationWindow, checkoutAbi, checkoutTypedData, erc20Abi, txUrl } from "@aevum-kit/aevum";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { parseUnits, type Hash, type Hex } from "viem";
import { useAccount, useConfig, useReadContract } from "wagmi";
import { readContract, signTypedData, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { CheckIcon } from "@/components/Icons";
import { useToken } from "@/components/useToken";
import { appChain, checkoutAddress, hasExplorer } from "@/lib/env";
import { explain } from "@/lib/errors";
import { demoOrder, newOrderId, orderLabel, short } from "@/lib/order";

type Mode = "gasless" | "standard";
type Phase = "idle" | "working" | "done" | "error";

const STEPS: Record<Mode, { title: string; who: string }[]> = {
  gasless: [
    { title: "Sign payment authorization", who: "EIP-3009 · your wallet signs, no gas" },
    { title: "Relayer submits transaction", who: "payWithAuthorization · the relayer pays gas" },
    { title: "Confirmed on Aevum", who: "The Paid event is your receipt" },
  ],
  standard: [
    { title: "Approve tUSD8", who: "approve(Checkout, exact total) · you pay gas" },
    { title: "Pay order", who: "Checkout.pay(orderId, amount) · you pay gas" },
    { title: "Confirmed on Aevum", who: "The Paid event is your receipt" },
  ],
};

export default function CheckoutPage() {
  const config = useConfig();
  const { address, isConnected, chainId } = useAccount();
  const onChain = isConnected && chainId === appChain.id;
  const token = useToken();

  const [mode, setMode] = useState<Mode>("gasless");
  const [orderId, setOrderId] = useState<Hex | null>(null);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hash | null>(null);
  const [block, setBlock] = useState<bigint | null>(null);

  useEffect(() => setOrderId(newOrderId()), []);

  const relay = useQuery({
    queryKey: ["relay-status"],
    queryFn: async () => (await fetch("/api/relay")).json() as Promise<{ enabled: boolean; relayer: string | null }>,
  });
  const gaslessAvailable = relay.data?.enabled ?? false;
  useEffect(() => {
    if (relay.data && !relay.data.enabled) setMode("standard");
  }, [relay.data]);

  const balance = useReadContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: appChain.id,
    query: { enabled: onChain && Boolean(token.address) },
  });

  const amount = parseUnits(demoOrder.total, token.decimals);
  const enoughBalance = balance.data === undefined || balance.data >= amount;
  const busy = phase === "working";

  function reset(nextMode = mode) {
    setMode(nextMode);
    setStep(0);
    setPhase("idle");
    setError(null);
    setTxHash(null);
    setBlock(null);
  }

  async function payGasless() {
    if (!address || !checkoutAddress || !token.address || !orderId) return;
    // 1. Sign. The nonce comes from the contract and ties this signature to this order.
    const nonce = await readContract(config, { address: checkoutAddress, abi: checkoutAbi, functionName: "authorizationNonce", args: [orderId] });
    const { validAfter, validBefore } = authorizationWindow(600);
    const signature = await signTypedData(config, {
      account: address,
      ...checkoutTypedData(appChain.id, token.address, { from: address, to: checkoutAddress, value: amount, validAfter, validBefore, nonce }),
    });
    setStep(1);
    // 2. Hand it to the relayer (web/src/app/api/relay/route.ts).
    const res = await fetch("/api/relay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        from: address,
        amount: amount.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        signature,
      }),
    });
    const data = (await res.json()) as { hash?: Hash; error?: string };
    if (!res.ok || !data.hash) throw new Error(data.error ?? "The relayer didn't accept the payment.");
    setTxHash(data.hash);
    setStep(2);
    return data.hash;
  }

  async function payStandard() {
    if (!address || !checkoutAddress || !token.address || !orderId) return;
    // 1. Approve exactly the order total, never an unlimited amount.
    const allowance = await readContract(config, { address: token.address, abi: erc20Abi, functionName: "allowance", args: [address, checkoutAddress] });
    if (allowance < amount) {
      const approveHash = await writeContract(config, { address: token.address, abi: erc20Abi, functionName: "approve", args: [checkoutAddress, amount] });
      await waitForTransactionReceipt(config, { hash: approveHash });
    }
    setStep(1);
    // 2. Pay.
    const hash = await writeContract(config, { address: checkoutAddress, abi: checkoutAbi, functionName: "pay", args: [orderId, amount] });
    setTxHash(hash);
    setStep(2);
    return hash;
  }

  async function onPay() {
    if (phase === "done") {
      setOrderId(newOrderId());
      reset();
      return;
    }
    setError(null);
    setPhase("working");
    setStep(0);
    try {
      const hash = mode === "gasless" ? await payGasless() : await payStandard();
      if (!hash) throw new Error("Connect your wallet first.");
      const receipt = await waitForTransactionReceipt(config, { hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted on chain. Nothing was charged.");
      setBlock(receipt.blockNumber);
      setStep(3);
      setPhase("done");
      balance.refetch();
    } catch (e) {
      setError(explain(e));
      setPhase("error");
    }
  }

  const cta = (() => {
    if (!isConnected) return "Connect a wallet to pay";
    if (!onChain) return "Switch network to pay";
    if (!checkoutAddress) return "Deploy Checkout first";
    if (phase === "done") return "Start a new order";
    if (phase === "error") return mode === "gasless" ? "Sign again" : "Try again";
    if (busy) return ["Check your wallet…", mode === "gasless" ? "Waiting for relayer…" : "Check your wallet…", "Confirming…"][step] ?? "Working…";
    return mode === "gasless" ? `Sign & pay ${demoOrder.total} ${token.symbol}` : `Approve & pay ${demoOrder.total} ${token.symbol}`;
  })();
  const ctaDisabled = !onChain || !checkoutAddress || busy || (!enoughBalance && phase !== "done");

  return (
    <main className="shell">
      <div className="page-head">
        <div>
          <p className="eyebrow">Example · Checkout.sol</p>
          <h1>Pay with tUSD8</h1>
          <p className="lede">A neutral checkout you can turn into an invoice, a payroll run or a crowdfund pledge. Try both payment modes.</p>
        </div>
      </div>

      <div className="row">
        <section className="card stack" aria-label="Order" style={{ flex: "1 1 340px" }}>
          <div className="check-top" style={{ alignItems: "baseline" }}>
            <h2>Order</h2>
            <span className="mono" style={{ color: "var(--text-muted)" }}>{orderId ? orderLabel(orderId) : "…"}</span>
          </div>
          <div className="lines">
            {demoOrder.lines.map((l, i) => (
              <div key={l.label} className={`line ${i > 0 ? "muted" : ""}`}>
                <span>{l.label}</span>
                <span className="num">{l.amount}</span>
              </div>
            ))}
            <div className="rule" />
            <div className="line" style={{ alignItems: "baseline" }}>
              <span style={{ fontWeight: 600 }}>Total</span>
              <span className="total">
                {demoOrder.total} <small>{token.symbol}</small>
              </span>
            </div>
          </div>
          <dl className="kv" style={{ fontSize: 13 }}>
            <dt>Checkout</dt>
            <dd>{checkoutAddress ? short(checkoutAddress) : "not deployed"}</dd>
            <dt>Your balance</dt>
            <dd>{balance.data !== undefined ? `${(Number(balance.data) / 10 ** token.decimals).toFixed(2)} ${token.symbol}` : "—"}</dd>
          </dl>
        </section>

        <section className="card stack" aria-label="Payment" style={{ flex: "1.3 1 420px" }}>
          <div className="modes" role="radiogroup" aria-label="Payment mode">
            {(
              [
                { id: "gasless", title: "Gasless", tag: "EIP-3009", desc: gaslessAvailable ? "Sign once. A relayer submits it. You need no tQDAY." : "Off: set RELAYER_PRIVATE_KEY in web/.env.local to enable." },
                { id: "standard", title: "Standard", tag: "approve + pay", desc: "Two wallet transactions. You pay gas in tQDAY." },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                className="mode"
                aria-checked={mode === m.id}
                disabled={busy || (m.id === "gasless" && !gaslessAvailable)}
                onClick={() => reset(m.id)}
              >
                <span className="mode-top">
                  {m.title}
                  <span className="tag">{m.tag}</span>
                </span>
                <span className="mode-desc">{m.desc}</span>
              </button>
            ))}
          </div>

          <ol className="steps">
            {STEPS[mode].map((s, i) => {
              const done = step > i;
              const active = busy && step === i;
              return (
                <li key={s.title} className={`step ${done ? "done" : active ? "active" : ""}`}>
                  <div className="step-dot">{done ? <CheckIcon /> : i + 1}</div>
                  <div className="step-body">
                    <div className="step-top">
                      <span className="step-title">{s.title}</span>
                      <span className="step-state">{done ? "Done" : active ? "In progress…" : "Waiting"}</span>
                    </div>
                    <p className="step-who">{s.who}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          {!enoughBalance && phase !== "done" && (
            <div className="notice warn" role="status">
              <strong>Not enough {token.symbol}</strong>
              <span>
                This order needs {demoOrder.total} {token.symbol}. See the <Link href="/">Setup</Link> page for how to get test tokens.
              </span>
            </div>
          )}

          {error && (
            <div className="notice bad" role="alert">
              <strong>Payment didn&apos;t go through</strong>
              <span>{error}</span>
            </div>
          )}

          {phase === "done" && orderId && txHash && (
            <div className="notice good" role="status">
              <div className="row-between">
                <strong>
                  Paid {demoOrder.total} {token.symbol}
                  {block !== null ? ` · confirmed in block ${block.toLocaleString("en-US")}` : ""}
                </strong>
                <span style={{ display: "flex", gap: 16 }}>
                  {hasExplorer && (
                    <a href={txUrl(txHash)} target="_blank" rel="noreferrer">
                      Explorer
                    </a>
                  )}
                  <Link href={`/receipts/${orderId}?tx=${txHash}`}>View receipt</Link>
                </span>
              </div>
            </div>
          )}

          <button type="button" className="btn big block" disabled={ctaDisabled} onClick={onPay}>
            {cta}
          </button>
          <p className="fine">
            {mode === "gasless"
              ? "The signature is valid for 10 minutes, for this exact amount, and only for this order."
              : "The approval is for the exact order total, never unlimited."}
          </p>
        </section>
      </div>
    </main>
  );
}
