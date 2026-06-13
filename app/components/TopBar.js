"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { getWalletAddress } from "../../lib/privy";
import Link from "next/link";
import { getOrCreateProfile } from "../actions/campaigns";
import { getAffiliateProfile } from "../actions/affiliates";

const hasPrivy = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

function PrivyTopBar() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const [address, setAddress] = useState("");
  const [affiliateRefCode, setAffiliateRefCode] = useState(null);
  const [showAffiliateSettings, setShowAffiliateSettings] = useState(false);

  useEffect(() => {
    if (ready && walletsReady && authenticated) {
      const addr = getWalletAddress(user, wallets);
      setAddress(addr);
      
      const fetchAffiliateStatus = async () => {
        try {
          const profileRes = await getOrCreateProfile(addr);
          if (profileRes.success) {
            const affRes = await getAffiliateProfile(profileRes.data.id);
            if (affRes.success && affRes.data) {
              setAffiliateRefCode(affRes.data.referralCode);
            }
          }
        } catch (e) {
          console.error("Failed to fetch affiliate status", e);
        }
      };
      fetchAffiliateStatus();
    } else {
      setAddress("");
      setAffiliateRefCode(null);
    }
  }, [ready, walletsReady, authenticated, user, wallets]);

  const truncateAddress = (addr) => {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="actions">
      {authenticated ? (
        <div className="wallet-info" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {affiliateRefCode && (
            <div style={{ position: 'relative' }}>
              <button className="btn-logout" onClick={() => setShowAffiliateSettings(!showAffiliateSettings)}>Affiliate Settings</button>
              {showAffiliateSettings && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '0.5rem', background: 'var(--surface-color)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', width: '250px', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Your Referral Link</h4>
                  <input type="text" className="form-input" value={`${window.location.origin}/?ref=${affiliateRefCode}`} readOnly style={{ width: '100%', fontSize: '0.8rem', padding: '0.4rem' }} onClick={(e) => e.target.select()} />
                </div>
              )}
            </div>
          )}
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
        <Link href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          🌿 <span>Giveaway Builder</span>
        </Link>
      </div>
      <nav className="nav-links">
        <Link href="/" className="nav-link">Create Campaign</Link>
        <Link href="/dashboard" className="nav-link">Dashboard</Link>
      </nav>
      {hasPrivy ? <PrivyTopBar /> : <UnconfiguredTopBar />}
    </header>
  );
}

