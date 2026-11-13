"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { defaultNetwork, networkByChainId, networkByKey, type Network, type NetworkKey } from "./env";

const STORAGE_KEY = "aevum-kit:network";

interface NetworkState {
  /** The network every page reads from and sends to. */
  net: Network;
  /** Pick a network. If a wallet is connected, it is asked to switch too. */
  select: (key: NetworkKey) => void;
}

const NetworkContext = createContext<NetworkState | null>(null);

/**
 * Which network the app is on. It follows the wallet when the wallet is on one of the
 * configured networks; otherwise it uses the last choice from the switcher.
 */
export function NetworkProvider({ children }: { children: ReactNode }) {
  const { chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const [key, setKey] = useState<NetworkKey>(defaultNetwork.key);

  useEffect(() => {
    try {
      const saved = networkByKey(localStorage.getItem(STORAGE_KEY));
      if (saved) setKey(saved.key);
    } catch {
      // Storage can be blocked (private mode, previews). The default network is fine.
    }
  }, []);

  useEffect(() => {
    const walletNet = isConnected ? networkByChainId(chainId) : undefined;
    if (walletNet) setKey(walletNet.key);
  }, [chainId, isConnected]);

  const select = useCallback(
    (next: NetworkKey) => {
      const target = networkByKey(next);
      if (!target) return;
      setKey(target.key);
      try {
        localStorage.setItem(STORAGE_KEY, target.key);
      } catch {
        // See above.
      }
      if (isConnected && chainId !== target.chain.id) switchChain({ chainId: target.chain.id });
    },
    [chainId, isConnected, switchChain],
  );

  const net = networkByKey(key) ?? defaultNetwork;
  return <NetworkContext.Provider value={{ net, select }}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkState {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used inside <NetworkProvider>");
  return ctx;
}
