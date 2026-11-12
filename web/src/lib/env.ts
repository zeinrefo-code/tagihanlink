import { isAddress, type Address } from "viem";
import { aevumFork, aevumTestnet, localAnvil } from "@aevum-kit/aevum";

export type ChainMode = "aevum" | "fork" | "local";

const mode = (process.env.NEXT_PUBLIC_CHAIN ?? "aevum") as ChainMode;

export const chainMode: ChainMode = mode === "fork" || mode === "local" ? mode : "aevum";

export const appChain = chainMode === "fork" ? aevumFork : chainMode === "local" ? localAnvil : aevumTestnet;

const rawCheckout = process.env.NEXT_PUBLIC_CHECKOUT_ADDRESS ?? "";
export const checkoutAddress: Address | undefined = isAddress(rawCheckout) ? rawCheckout : undefined;

export const walletConnectProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || undefined;

const rawDeployBlock = process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? "";
export const deployBlock: bigint | undefined = /^\d+$/.test(rawDeployBlock) ? BigInt(rawDeployBlock) : undefined;

/** Explorer links only make sense on the real testnet. */
export const hasExplorer = chainMode === "aevum";

export const repoUrl = "https://github.com/qday-io/aevum-starter-kit";
