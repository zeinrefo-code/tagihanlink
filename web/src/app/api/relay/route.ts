import { NextResponse } from "next/server";
import {
  BaseError,
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  isHex,
  parseSignature,
  parseUnits,
  type Hex,
} from "viem";
import { nonceManager, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { aevumFork, checkoutAbi, isAnvilAccount, localAnvil, TUSD8_DECIMALS } from "@aevum-kit/aevum";
import { defaultNetwork, networkByChainId, type Network } from "@/lib/env";
import { explain } from "@/lib/errors";
import { priceOf } from "@/lib/order";

/**
 * The relayer behind "Gasless" checkout. The buyer only signs; this route submits
 * Checkout.payWithAuthorization and pays the gas from RELAYER_PRIVATE_KEY.
 *
 * Anyone on the internet can call this route, and every transaction it sends costs YOUR gas.
 * The rails, in the order they run:
 *  1. Only YOUR Checkout, only payWithAuthorization. It never forwards arbitrary calls.
 *  2. Only the price your app set for that order (priceOf). Dust payments to burn gas are refused.
 *  3. Not already paid, and not already being submitted.
 *  4. Simulated first, so a bad or expired signature costs nothing.
 *  5. Rate limits per IP and per payer, and a daily cap on transactions.
 *
 * The limits below live in this process's memory. That's fine for `next start` on one server.
 * On serverless (Vercel, Netlify…) every instance has its own copy and loses it on a cold start:
 * move them to a shared store (Redis, Upstash, your database) before you rely on them.
 */
export const runtime = "nodejs";

const MAX_WINDOW_SECONDS = 3600n;
const PER_IP_PER_MINUTE = 10;
const PER_PAYER_PER_MINUTE = 3;
const DAILY_TX_LIMIT = Number(process.env.RELAYER_DAILY_TX_LIMIT ?? 500);
const IN_FLIGHT_MS = 120_000;
const LOCAL_CHAINS = new Set<number>([localAnvil.id, aevumFork.id]);
const isDev = process.env.NODE_ENV !== "production";

// One account for the whole process, so viem's nonce manager can hand out nonces to
// concurrent requests without two transactions colliding.
let cachedAccount: PrivateKeyAccount | null | undefined;
function relayer(): PrivateKeyAccount | undefined {
  if (cachedAccount !== undefined) return cachedAccount ?? undefined;
  const raw = process.env.RELAYER_PRIVATE_KEY?.trim();
  const key = (raw?.startsWith("0x") ? raw : `0x${raw ?? ""}`) as Hex;
  cachedAccount = raw && isHex(key) && key.length === 66 ? privateKeyToAccount(key, { nonceManager }) : null;
  return cachedAccount ?? undefined;
}

/** anvil's default keys are public. On a real network, bots would empty that relayer in seconds. */
function usable(account: PrivateKeyAccount | undefined, net: Network): PrivateKeyAccount | undefined {
  if (!account) return undefined;
  if (isAnvilAccount(account.address) && !LOCAL_CHAINS.has(net.chain.id)) return undefined;
  return account;
}

// ---- in-memory limits (see the note at the top) ----
const hits = new Map<string, number[]>();
function limited(bucket: string, max: number): boolean {
  const now = Date.now();
  const recent = (hits.get(bucket) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(bucket, recent);
  if (hits.size > 10_000) {
    for (const [k, times] of hits) if (times.every((t) => now - t >= 60_000)) hits.delete(k);
  }
  return recent.length > max;
}

let day = "";
let sentToday = 0;
function overDailyLimit(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    sentToday = 0;
  }
  return sentToday >= DAILY_TX_LIMIT;
}

const inFlight = new Map<string, number>();
function claimInFlight(key: string): boolean {
  const now = Date.now();
  for (const [k, t] of inFlight) if (now - t > IN_FLIGHT_MS) inFlight.delete(k);
  if (inFlight.has(key)) return false;
  inFlight.set(key, now);
  return true;
}

/**
 * The caller's IP. Clients can write any X-Forwarded-For they like, so never trust its first entry.
 * Set TRUSTED_IP_HEADER to the header your host sets itself (Vercel: x-vercel-forwarded-for,
 * Cloudflare: cf-connecting-ip). Otherwise this takes the entry your own proxy appended last.
 */
function clientIp(req: Request): string {
  const trusted = process.env.TRUSTED_IP_HEADER?.trim().toLowerCase();
  if (trusted) return req.headers.get(trusted)?.split(",")[0]?.trim() || "unknown";
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",").at(-1)?.trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

const isUint = (v: unknown): v is string => typeof v === "string" && /^\d{1,78}$/.test(v);
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** The configured network a request is for. No chainId means the default network. */
function networkFor(chainId: unknown): Network | undefined {
  if (chainId === undefined || chainId === null || chainId === "") return defaultNetwork;
  return networkByChainId(Number(chainId));
}

/** GET /api/relay?chainId=… tells the app whether gasless mode is available on that network. */
export async function GET(req: Request) {
  const net = networkFor(new URL(req.url).searchParams.get("chainId"));
  const account = net ? usable(relayer(), net) : undefined;
  return NextResponse.json({ enabled: Boolean(account && net?.checkout), relayer: account?.address ?? null });
}

export async function POST(req: Request) {
  if (limited(`ip:${clientIp(req)}`, PER_IP_PER_MINUTE)) return fail("Too many requests. Wait a minute.", 429);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON.");
  }

  // Only networks the app is configured for, and only their Checkout.
  const net = networkFor(body.chainId);
  if (!net) return fail("This network isn't enabled in the app.");
  const account = usable(relayer(), net);
  const checkoutAddress = net.checkout;
  if (!account || !checkoutAddress) {
    // Which settings are missing is useful while you build, and nobody else's business once deployed.
    return fail(
      isDev
        ? `Gasless mode is off on ${net.label}. Set RELAYER_PRIVATE_KEY (not an anvil key, except on local chains) and NEXT_PUBLIC_CHECKOUT_${net.key.toUpperCase()} in web/.env.local.`
        : "Gasless mode isn't available right now. Use Standard mode.",
      503,
    );
  }

  const { orderId, from, amount, validAfter, validBefore, signature } = body;
  if (
    !(typeof orderId === "string" && isHex(orderId) && orderId.length === 66) ||
    !(typeof from === "string" && isAddress(from)) ||
    !isUint(amount) || !isUint(validAfter) || !isUint(validBefore) ||
    !(typeof signature === "string" && isHex(signature))
  ) {
    return fail("Malformed payment request.");
  }
  if (BigInt(amount) !== parseUnits(priceOf(orderId), TUSD8_DECIMALS)) return fail("The amount doesn't match this order's price.");
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (BigInt(validBefore) > now + MAX_WINDOW_SECONDS) return fail("Signature window is too long (max 1 hour).");
  if (limited(`payer:${from.toLowerCase()}`, PER_PAYER_PER_MINUTE)) return fail("Too many payments from this address. Wait a minute.", 429);

  let v: bigint | undefined, r: Hex, s: Hex, yParity: number | undefined;
  try {
    ({ v, r, s, yParity } = parseSignature(signature));
  } catch {
    return fail("Invalid signature.");
  }
  const vNum = v !== undefined ? Number(v) : 27 + (yParity ?? 0);

  const transport = http();
  const client = createPublicClient({ chain: net.chain, transport });
  const wallet = createWalletClient({ account, chain: net.chain, transport });

  const flightKey = `${net.chain.id}:${orderId.toLowerCase()}`;
  if (!claimInFlight(flightKey)) return fail("This order is already being submitted.", 409);
  try {
    if (await client.readContract({ address: checkoutAddress, abi: checkoutAbi, functionName: "isPaid", args: [orderId] })) {
      inFlight.delete(flightKey);
      return fail("This order is already paid. Start a new order.", 409);
    }
    if (overDailyLimit()) {
      inFlight.delete(flightKey);
      return fail("The relayer reached its daily limit. Use Standard mode.", 503);
    }

    const call = {
      account,
      address: checkoutAddress,
      abi: checkoutAbi,
      functionName: "payWithAuthorization",
      args: [orderId, from, BigInt(amount), BigInt(validAfter), BigInt(validBefore), vNum, r, s],
    } as const;
    await client.simulateContract(call);
    const hash = await wallet.writeContract({ ...call, type: "legacy" });
    sentToday++;
    return NextResponse.json({ hash });
  } catch (e) {
    inFlight.delete(flightKey);
    // Out of gas here means the RELAYER is out of gas, not the buyer.
    if (e instanceof BaseError && /insufficient funds/i.test(e.message)) {
      console.error("[relay] relayer is out of gas", account.address);
      return fail("The relayer is out of gas. Use Standard mode for now.", 503);
    }
    return fail(explain(e));
  }
}
