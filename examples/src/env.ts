import { createPublicClient, http, isAddress, isHex, type Address, type Hex } from "viem";
import { aevumFork, aevumTestnet, localAnvil } from "@aevum-kit/aevum";

export function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing ${name}. Copy examples/.env.example to examples/.env and fill it in.`);
    process.exit(1);
  }
  return v;
}

export function requiredAddress(name: string): Address {
  const v = required(name);
  if (!isAddress(v)) {
    console.error(`${name} is not a valid address: ${v}`);
    process.exit(1);
  }
  return v;
}

export function requiredKey(name: string): Hex {
  const v = required(name);
  const key = (v.startsWith("0x") ? v : `0x${v}`) as Hex;
  if (!isHex(key) || key.length !== 66) {
    console.error(`${name} must be a 32-byte hex private key.`);
    process.exit(1);
  }
  return key;
}

/** Picks the chain from the RPC's chain ID: Aevum testnet, `make fork`, or plain anvil. */
export async function connect() {
  const rpcUrl = process.env.RPC_URL?.trim() || aevumTestnet.rpcUrls.default.http[0];
  const probe = createPublicClient({ transport: http(rpcUrl) });
  const id = await probe.getChainId();
  const chain = id === aevumTestnet.id ? aevumTestnet : id === aevumFork.id ? aevumFork : { ...localAnvil, id };
  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  return { client, chain, rpcUrl };
}
