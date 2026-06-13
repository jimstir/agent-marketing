"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { getWalletAddress } from "../../lib/privy";
import Link from "next/link";
import { getOrCreateProfile } from "../actions/campaigns";
import { getAffiliateProfile, getAffiliateLinks, submitAppeal } from "../actions/affiliates";

const hasPrivy = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

function PrivyTopBar() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const [address, setAddress] = useState("");
  const [isAffiliate, setIsAffiliate] = useState(false);
  const [affiliateLinks, setAffiliateLinks] = useState([]);
  const [showAffiliateSettings, setShowAffiliateSettings] = useState(false);

  const currentAddr = (ready && walletsReady && authenticated) ? getWalletAddress(user, wallets) : "";

  useEffect(() => {
    setAddress(currentAddr);
    if (currentAddr) {
      const fetchAffiliateStatus = async () => {
        try {
          const profileRes = await getOrCreateProfile(currentAddr);
          if (profileRes.success) {
            const affRes = await getAffiliateProfile(profileRes.data.id);
            if (affRes.success && affRes.data) {
              setIsAffiliate(true);
              const linksRes = await getAffiliateLinks(affRes.data.id);
              if (linksRes.success) {
                setAffiliateLinks(linksRes.data);
              }
            }
          }
        } catch (e) {
          console.error("Failed to fetch affiliate status", e);
        }
      };
      fetchAffiliateStatus();
    } else {
      setIsAffiliate(false);
      setAffiliateLinks([]);
    }
  }, [currentAddr]);

  const truncateAddress = (addr) => {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const handleAppeal = async (linkId, message) => {
    const res = await submitAppeal(linkId, message);
    if (res.success) {
      alert("Appeal submitted to the campaign manager!");
    } else {
      alert("Appeal failed: " + res.error);
    }
  };

  return (
    <div className="actions">
      {authenticated ? (
        <div className="wallet-info" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {isAffiliate && (
            <div style={{ position: 'relative' }}>
              <button className="btn-logout" onClick={() => setShowAffiliateSettings(!showAffiliateSettings)}>Affiliate Settings</button>
              {showAffiliateSettings && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '0.5rem', background: 'var(--surface-color)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', width: '300px', zIndex: 50, maxHeight: '400px', overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
                  <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Your Active Campaign Links</h4>
                  {affiliateLinks.length === 0 ? (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>You haven't joined any campaigns yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {affiliateLinks.map(link => (
                        <div key={link.id} style={{ background: 'var(--bg-color)', padding: '0.75rem', borderRadius: '6px' }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--primary-color)', marginBottom: '0.25rem' }}>{link.campaign.name}</div>
                          {link.status === "BLOCKED" ? (
                            <div style={{ color: 'red', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>Status: Blocked</span>
                              <button className="btn-primary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => {
                                const msg = prompt("Enter your reason for appeal. This will be sent to the Campaign Manager along with your current Reputation Score.");
                                if (msg) handleAppeal(link.id, msg);
                              }}>Appeal Block</button>
                            </div>
                          ) : (
                            <input 
                              type="text" 
                              className="form-input" 
                              value={`${window.location.origin}/?ref=${link.referralCode}`} 
                              readOnly 
                              style={{ width: '100%', fontSize: '0.75rem', padding: '0.4rem' }} 
                              onClick={(e) => e.target.select()} 
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
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

