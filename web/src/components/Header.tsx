"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useSwitchChain } from "wagmi";
import { networks } from "@/lib/env";
import { useNetwork } from "@/lib/network";

const links = [
  { href: "/", label: "Setup" },
  { href: "/checkout", label: "Checkout" },
  { href: "/activity", label: "Activity" },
  { href: "/docs", label: "Docs" },
];

export function Header() {
  const pathname = usePathname();
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const { net, select } = useNetwork();
  const wrongNetwork = isConnected && chainId !== net.chain.id;

  return (
    <>
      <header className="topbar">
        <div className="shell">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-name">Aevum Starter Kit</span>
          </Link>
          <nav className="nav" aria-label="Main">
            {links.map((l) => {
              const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}>
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="topbar-end">
            {networks.length > 1 && (
              <div className="net-switch" role="radiogroup" aria-label="Network">
                {networks.map((n) => (
                  <button
                    key={n.key}
                    type="button"
                    role="radio"
                    aria-checked={n.key === net.key}
                    title={`${n.chain.name} · chain ${n.chain.id}`}
                    onClick={() => select(n.key)}
                  >
                    <span className={`net-dot ${n.key}`} aria-hidden="true" />
                    {n.label}
                  </button>
                ))}
              </div>
            )}
            <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />
          </div>
        </div>
      </header>
      {wrongNetwork && (
        <div className="banner" role="alert">
          <div className="shell">
            <span>
              Your wallet is on another network. This app is set to <strong>{net.chain.name} ({net.chain.id})</strong>.
            </span>
            <button type="button" className="btn warn small" disabled={isPending} onClick={() => switchChain({ chainId: net.chain.id })}>
              {isPending ? "Check your wallet…" : "Switch network"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
