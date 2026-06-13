"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { getWalletAddress } from "../../lib/privy";

const hasPrivy = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

function PrivyTopBar() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const [address, setAddress] = useState("");

  useEffect(() => {
    if (ready && walletsReady && authenticated) {
      setAddress(getWalletAddress(user, wallets));
    } else {
      setAddress("");
    }
  }, [ready, walletsReady, authenticated, user, wallets]);

  const truncateAddress = (addr) => {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="actions">
      {authenticated ? (
        <div className="wallet-info">
          <span className="address">{truncateAddress(address)}</span>
          <button className="btn-logout" onClick={logout}>Disconnect</button>
        </div>
      ) : (
        <button className="btn-connect" onClick={login} disabled={!ready}>
          Connect Wallet
        </button>
      )}
    </div>
  );
}

function UnconfiguredTopBar() {
  const handleConnect = () => {
    alert("Privy is not configured! Please add your NEXT_PUBLIC_PRIVY_APP_ID to the .env file and restart the server.");
  };

  return (
    <div className="actions">
      <button className="btn-connect" onClick={handleConnect}>
        Connect Wallet
      </button>
    </div>
  );
}

export default function TopBar() {
  return (
    <header className="topbar">
      <div className="logo">
        🌿 <span>Giveaway Builder</span>
      </div>
      {hasPrivy ? <PrivyTopBar /> : <UnconfiguredTopBar />}
    </header>
  );
}

