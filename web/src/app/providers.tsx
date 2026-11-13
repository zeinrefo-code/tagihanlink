"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { defaultNetwork } from "@/lib/env";
import { NetworkProvider } from "@/lib/network";
import { wagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={defaultNetwork.chain}
          locale="en-US"
          theme={darkTheme({ accentColor: "#0257FF", borderRadius: "medium" })}
          appInfo={{ appName: "Aevum Starter Kit" }}
        >
          <NetworkProvider>{children}</NetworkProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
