import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import type { Chain } from "viem";
import { createConfig, http, type Transport } from "wagmi";
import { networks, walletConnectProjectId } from "./env";

const appName = "Aevum Starter Kit";

// With a WalletConnect project id: extension wallets + QR for mobile wallets.
// Without one: any injected browser wallet (MetaMask, Rabby, …) still works.
const connectors = connectorsForWallets(
  walletConnectProjectId
    ? [
        { groupName: "Popular", wallets: [metaMaskWallet, rabbyWallet, walletConnectWallet] },
        { groupName: "More", wallets: [injectedWallet] },
      ]
    : [{ groupName: "Browser wallet", wallets: [injectedWallet] }],
  { appName, projectId: walletConnectProjectId ?? "not-set" },
);

const chains = networks.map((n) => n.chain) as [Chain, ...Chain[]];

export const wagmiConfig = createConfig({
  chains,
  connectors,
  transports: Object.fromEntries(chains.map((c) => [c.id, http()])) as Record<number, Transport>,
  ssr: true,
});
