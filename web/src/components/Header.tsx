"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useSwitchChain } from "wagmi";
import { appChain, repoUrl } from "@/lib/env";

const links = [
  { href: "/", label: "Setup" },
  { href: "/checkout", label: "Checkout" },
  { href: "/activity", label: "Activity" },
];

export function Header() {
  const pathname = usePathname();
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const wrongNetwork = isConnected && chainId !== appChain.id;

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
            <a href={`${repoUrl}#readme`} target="_blank" rel="noreferrer">
              Docs
            </a>
          </nav>
          <div className="topbar-end">
            <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />
          </div>
        </div>
      </header>
      {wrongNetwork && (
        <div className="banner" role="alert">
          <div className="shell">
            <span>
              Your wallet is on another network. This app runs on <strong>{appChain.name} ({appChain.id})</strong>.
            </span>
            <button type="button" className="btn warn small" disabled={isPending} onClick={() => switchChain({ chainId: appChain.id })}>
              {isPending ? "Check your wallet…" : "Switch network"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
