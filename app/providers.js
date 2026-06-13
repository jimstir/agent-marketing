"use client";

import { useEffect, useState } from "react";

export default function Providers({ children }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const [PrivyProviderComponent, setPrivyProviderComponent] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!appId) return;
      try {
        const mod = await import("@privy-io/react-auth");
        if (mounted && mod?.PrivyProvider) setPrivyProviderComponent(() => mod.PrivyProvider);
      } catch (err) {
        console.warn("Failed to dynamically load @privy-io/react-auth:", err);
      }
    };
    load();
    return () => (mounted = false);
  }, [appId]);

  if (!appId) {
    if (typeof window !== "undefined") {
      console.warn(
        "NEXT_PUBLIC_PRIVY_APP_ID is not set. Wallet connection will not work until you add it to .env.local."
      );
    }
    return children;
  }

  if (!PrivyProviderComponent) {
    return children;
  }

  const PrivyProvider = PrivyProviderComponent;

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["wallet", "email"],
        appearance: {
          theme: "light",
          accentColor: "#556B2F", // Earthy dark olive green
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
