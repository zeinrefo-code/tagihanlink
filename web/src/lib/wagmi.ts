import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http, type Transport } from "wagmi";
import { appChain, walletConnectProjectId } from "./env";

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

export const wagmiConfig = createConfig({
  chains: [appChain],
  connectors,
  transports: { [appChain.id]: http() } as Record<typeof appChain.id, Transport>,
  ssr: true,
});
