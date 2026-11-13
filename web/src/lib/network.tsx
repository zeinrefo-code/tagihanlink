"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { defaultNetwork, networkByChainId, networkByKey, type Network, type NetworkKey } from "./env";
import { explain } from "./errors";

const STORAGE_KEY = "aevum-kit:network";

interface NetworkState {
  /** The network every page reads from and sends to. */
  net: Network;
  /** Pick a network. If a wallet is connected, it is asked to switch first. */
  select: (key: NetworkKey) => void;
  /** The network we asked the wallet to switch to, while it's waiting for the user. */
  switchingTo: Network | null;
  /** Why the last switch failed, in plain words. */
  switchError: string | null;
}

const NetworkContext = createContext<NetworkState | null>(null);

function remember(key: NetworkKey) {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Storage can be blocked (private mode, previews). Not remembering the choice is fine.
  }
}

/**
 * Which network the app is on.
 *  - Wallet connected and on a configured network: the app follows the wallet.
 *  - Otherwise: the last choice from the switcher (or the first network in NEXT_PUBLIC_NETWORKS).
 * With a wallet connected, picking a network asks the wallet to switch, and the app only moves once
 * the wallet has actually switched. That way the app never reads one chain while the wallet signs on another.
 */
export function NetworkProvider({ children }: { children: ReactNode }) {
  const { chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [key, setKey] = useState<NetworkKey>(defaultNetwork.key);
  const [switchingTo, setSwitchingTo] = useState<Network | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = networkByKey(localStorage.getItem(STORAGE_KEY));
      if (saved) setKey(saved.key);
    } catch {
      // See remember().
    }
  }, []);

  useEffect(() => {
    const walletNet = isConnected ? networkByChainId(chainId) : undefined;
    if (!walletNet) return;
    setKey(walletNet.key);
    remember(walletNet.key);
    setSwitchingTo(null);
    setSwitchError(null);
  }, [chainId, isConnected]);

  const select = useCallback(
    async (next: NetworkKey) => {
      const target = networkByKey(next);
      if (!target) return;
      setSwitchError(null);
      if (!isConnected || chainId === target.chain.id) {
        setKey(target.key);
        remember(target.key);
        return;
      }
      setSwitchingTo(target);
      try {
        // Adds the network to the wallet first if it doesn't know it yet.
        await switchChainAsync({ chainId: target.chain.id });
      } catch (e) {
        console.error("[network] switch failed", target.chain.id, e);
        setSwitchError(`Couldn't switch to ${target.label}: ${explain(e)}`);
      } finally {
        setSwitchingTo(null);
      }
    },
    [chainId, isConnected, switchChainAsync],
  );

  const net = networkByKey(key) ?? defaultNetwork;
  return (
    <NetworkContext.Provider value={{ net, select: (k) => void select(k), switchingTo, switchError }}>{children}</NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkState {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used inside <NetworkProvider>");
  return ctx;
}
