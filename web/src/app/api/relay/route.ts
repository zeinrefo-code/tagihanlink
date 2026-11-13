import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  isHex,
  parseSignature,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { checkoutAbi } from "@aevum-kit/aevum";
import { defaultNetwork, networkByChainId, type Network } from "@/lib/env";
import { explain } from "@/lib/errors";

/**
 * The relayer behind "Gasless" checkout. The buyer only signs; this route submits
 * Checkout.payWithAuthorization and pays the gas from RELAYER_PRIVATE_KEY.
 *
 * Safety rails worth keeping if you build on this:
 *  - It only ever calls payWithAuthorization on YOUR Checkout. It never forwards arbitrary calls.
 *  - It simulates first, so a bad or expired signature costs nothing.
 *  - A small per-IP limit stops someone from draining the relayer's gas.
 */
export const runtime = "nodejs";

const MAX_WINDOW_SECONDS = 3600n;
const LIMIT_PER_MINUTE = 10;
const hits = new Map<string, number[]>();

function relayer() {
  const raw = process.env.RELAYER_PRIVATE_KEY?.trim();
  if (!raw) return undefined;
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  if (!isHex(key) || key.length !== 66) return undefined;
  return privateKeyToAccount(key);
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > LIMIT_PER_MINUTE;
}

const isUint = (v: unknown): v is string => typeof v === "string" && /^\d{1,78}$/.test(v);

/** The configured network a request is for. No chainId means the default network. */
function networkFor(chainId: unknown): Network | undefined {
  if (chainId === undefined || chainId === null || chainId === "") return defaultNetwork;
  return networkByChainId(Number(chainId));
}

/** GET /api/relay?chainId=… tells the app whether gasless mode is available on that network. */
export async function GET(req: Request) {
  const account = relayer();
  const net = networkFor(new URL(req.url).searchParams.get("chainId"));
  return NextResponse.json({ enabled: Boolean(account && net?.checkout), relayer: account?.address ?? null });
}

export async function POST(req: Request) {

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) return NextResponse.json({ error: "Too many requests. Wait a minute." }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // Only networks the app is configured for, and only their Checkout.
  const account = relayer();
  const net = networkFor(body.chainId);
  const checkoutAddress = net?.checkout;
  if (!net) return NextResponse.json({ error: "This network isn't enabled in the app." }, { status: 400 });
  if (!account || !checkoutAddress) {
    return NextResponse.json(
      { error: `Gasless mode is off on ${net.label}. Set RELAYER_PRIVATE_KEY and NEXT_PUBLIC_CHECKOUT_${net.key.toUpperCase()} in web/.env.local.` },
      { status: 503 },
    );
  }
  const { orderId, from, amount, validAfter, validBefore, signature } = body;
  if (
    !(typeof orderId === "string" && isHex(orderId) && orderId.length === 66) ||
    !(typeof from === "string" && isAddress(from)) ||
    !isUint(amount) || !isUint(validAfter) || !isUint(validBefore) ||
    !(typeof signature === "string" && isHex(signature))
  ) {
    return NextResponse.json({ error: "Malformed payment request." }, { status: 400 });
  }
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (BigInt(validBefore) > now + MAX_WINDOW_SECONDS) {
    return NextResponse.json({ error: "Signature window is too long (max 1 hour)." }, { status: 400 });
  }

  let v: bigint | undefined, r: Hex, s: Hex, yParity: number | undefined;
  try {
    ({ v, r, s, yParity } = parseSignature(signature));
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }
  const vNum = v !== undefined ? Number(v) : 27 + (yParity ?? 0);

  const transport = http();
  const client = createPublicClient({ chain: net.chain, transport });
  const wallet = createWalletClient({ account, chain: net.chain, transport });

  try {
    const call = {
      account,
      address: checkoutAddress,
      abi: checkoutAbi,
      functionName: "payWithAuthorization",
      args: [orderId, from, BigInt(amount), BigInt(validAfter), BigInt(validBefore), vNum, r, s],
    } as const;
    await client.simulateContract(call);
    const hash = await wallet.writeContract({ ...call, type: "legacy" });
    return NextResponse.json({ hash });
  } catch (e) {
    return NextResponse.json({ error: explain(e) }, { status: 400 });
  }
}
