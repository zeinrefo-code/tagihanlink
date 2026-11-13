import { defineChain } from "viem";

/**
 * QDay Aevum testnet.
 *
 * Things that differ from Ethereum and will bite you:
 *  - EVM is Shanghai. Compile with evm_version = "shanghai" (no MCOPY / TSTORE / blobs).
 *  - eth_getLogs returns at most 1,000 blocks per call. Use `getLogsChunked`.
 *  - No WebSocket RPC. Poll over HTTPS.
 *  - Legacy (type 0) transactions are the safest choice for scripts.
 */
export const aevumTestnet = defineChain({
  id: 44005,
  name: "QDay Aevum Testnet",
  nativeCurrency: { name: "Test QDAY", symbol: "tQDAY", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc-test.qday.info"] },
  },
  blockExplorers: {
    default: { name: "Aevum Explorer", url: "https://explorer-test.qday.info" },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
  testnet: true,
});

/** Local anvil. Start it with `make anvil` (Shanghai hardfork) or `make fork` (copy of Aevum). */
export const localAnvil = defineChain({
  id: 31337,
  name: "Local (anvil)",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

/**
 * Chain ID of `make fork`. The fork copies Aevum's state but runs under its own chain ID, so:
 *  - wallets keep it as a separate network next to the real testnet (switching is one click), and
 *  - EIP-712 signatures made on the fork (permit, EIP-3009) are not valid on the real testnet.
 */
export const AEVUM_FORK_CHAIN_ID = 440050;

/** `make fork`: a local copy of Aevum testnet on your machine. */
export const aevumFork = defineChain({
  ...aevumTestnet,
  id: AEVUM_FORK_CHAIN_ID,
  name: "Aevum fork (local)",
  // Not 8545: wallets often already have an anvil/Hardhat network there, and MetaMask refuses
  // to add a second network with the same RPC URL.
  rpcUrls: { default: { http: ["http://127.0.0.1:8555"] } },
  blockExplorers: undefined,
});

/** Largest block range a single eth_getLogs call may cover on Aevum. */
export const MAX_LOG_RANGE = 1000n;

export const links = {
  explorer: "https://explorer-test.qday.info",
  faucetWeb: "https://faucet.qday.info/en",
  docs: "https://community.qday.io/guide/",
} as const;

export function txUrl(hash: string): string {
  return `${links.explorer}/tx/${hash}`;
}

export function addressUrl(address: string): string {
  return `${links.explorer}/address/${address}`;
}
