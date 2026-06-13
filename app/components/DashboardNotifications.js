"use client";

import { useEffect, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { getWalletAddress } from "../../lib/privy";
import { getOrCreateProfile } from "../actions/campaigns";
import { getUserNotifications } from "../actions/notifications";
import { useSearchParams } from "next/navigation";

export default function DashboardNotifications() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const searchParams = useSearchParams();
  const deploySuccess = searchParams.get("deploySuccess");

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchNotifications() {
      if (ready && walletsReady && authenticated) {
        try {
          const address = getWalletAddress(user, wallets);
          const profileRes = await getOrCreateProfile(address);
          if (profileRes.success) {
            const notifRes = await getUserNotifications(profileRes.data.id);
            if (notifRes.success) {
              setNotifications(notifRes.data);
            }
          }
        } catch (error) {
          console.error("Failed to load notifications", error);
        } finally {
          setLoading(false);
        }
      } else if (ready && walletsReady && !authenticated) {
        setLoading(false);
      }
    }
    
    fetchNotifications();
  }, [ready, walletsReady, authenticated, user, wallets]);

  if (loading) return <div style={{ padding: '1rem', textAlign: 'center' }}>Loading activity...</div>;
  if (!authenticated || notifications.length === 0) return null;

  return (
    <section className="notifications-section" style={{ marginBottom: '2rem' }}>
      {deploySuccess && (
        <div style={{ background: '#e6ffe6', color: '#006600', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #00cc00' }}>
          🎉 <strong>Success!</strong> Your campaign has been successfully deployed and your AI agent is now active!
        </div>
      )}
      
      <h3>Recent Activity</h3>
      <div className="notifications-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {notifications.map(notif => (
          <div key={notif.id} className="notification-card" style={{ background: 'var(--surface-color)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--primary-color)' }}>{notif.type}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{new Date(notif.createdAt).toLocaleString()}</span>
            </div>
            <p style={{ margin: '0 0 1rem 0' }}>{notif.message}</p>
            
            <div className="tx-links" style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem' }}>
              {notif.ethTxHash && (
                <a href={`https://etherscan.io/tx/${notif.ethTxHash}`} target="_blank" rel="noopener noreferrer" style={{ color: '#627EEA', textDecoration: 'none' }}>
                  🔗 View ETH Registration TX
                </a>
              )}
              {notif.arcTxHash && (
                <a href={`https://explorer.testnet.arc.network/tx/${notif.arcTxHash}`} target="_blank" rel="noopener noreferrer" style={{ color: '#00D1B2', textDecoration: 'none' }}>
                  🔗 View Arc Funding TX
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
