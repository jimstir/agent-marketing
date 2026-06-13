"use client";
import { useState, useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { getWalletAddress } from "../../lib/privy";
import { updateCampaignPolicies, updateCampaignDetails, initAgentAuthorization, finalizeAgentAuthorization } from "../actions/campaigns";

export default function CampaignModal({ campaign, onClose }) {
  const { user, authenticated, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const [address, setAddress] = useState("");
  const [isEditingPolicy, setIsEditingPolicy] = useState(false);
  const [policyText, setPolicyText] = useState(campaign?.walletPolicies || "");
  const [isSaving, setIsSaving] = useState(false);

  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [detailsForm, setDetailsForm] = useState({
    description: campaign?.description || "",
    challengeCriteria: campaign?.challengeCriteria || "",
  });
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  const [isRefreshingAgentAuth, setIsRefreshingAgentAuth] = useState(false);

  useEffect(() => {
    if (authenticated) {
      setAddress(getWalletAddress(user, wallets));
    } else {
      setAddress("");
    }
  }, [authenticated, user, wallets]);

  if (!campaign) return null;

  const isManager = address && campaign.manager?.walletAddress && address.toLowerCase() === campaign.manager.walletAddress.toLowerCase();

  const handleSavePolicy = async () => {
    setIsSaving(true);
    const result = await updateCampaignPolicies(campaign.id, policyText);
    if (result.success) {
      setIsEditingPolicy(false);
      campaign.walletPolicies = policyText; // optimistically update local state
    } else {
      alert("Failed to save policies");
    }
    setIsSaving(false);
  };

  const handleSaveDetails = async () => {
    setIsSavingDetails(true);
    const result = await updateCampaignDetails(campaign.id, detailsForm);
    if (result.success) {
      setIsEditingDetails(false);
      campaign.description = detailsForm.description;
      campaign.challengeCriteria = detailsForm.challengeCriteria;
    } else {
      alert("Failed to save details");
    }
    setIsSavingDetails(false);
  };

  const handleRefreshAgentAuth = async () => {
    setIsRefreshingAgentAuth(true);
    try {
      const initAuthRes = await initAgentAuthorization();
      if (!initAuthRes.success) throw new Error("Could not initialize agent authorization.");
      
      const { device_code, user_code } = initAuthRes.data;

      const userAccessToken = await getAccessToken();
      const verifyRes = await fetch("https://auth.privy.io/api/oauth/v2/device_verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "privy-app-id": process.env.NEXT_PUBLIC_PRIVY_APP_ID,
          "Authorization": `Bearer ${userAccessToken}`
        },
        body: JSON.stringify({ user_code, action: "approve" })
      });
      if (!verifyRes.ok) throw new Error("Agent authorization approval failed.");

      const finalAuthRes = await finalizeAgentAuthorization(campaign.id, device_code);
      if (!finalAuthRes.success) throw new Error("Failed to finalize agent authorization.");

      alert("Agent authorization refreshed successfully!");
    } catch (e) {
      console.error(e);
      alert("Failed to refresh agent authorization: " + e.message);
    } finally {
      setIsRefreshingAgentAuth(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{campaign.name}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <div className="modal-stat-row">
            <div className="stat-box">
              <span className="stat-label">Reward Amount</span>
              <span className="stat-value">${campaign.rewardAmount}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Category</span>
              <span className="stat-value">{campaign.category || "General"}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Participants</span>
              <span className="stat-value">{campaign.participantsCount}</span>
            </div>
          </div>

          {isManager ? (
            isEditingDetails ? (
              <div className="modal-section">
                <h4>Campaign Description</h4>
                <textarea 
                  className="form-input" rows="4" 
                  value={detailsForm.description} 
                  onChange={(e) => setDetailsForm({...detailsForm, description: e.target.value})}
                  style={{ width: '100%', marginBottom: '1rem' }}
                />
                <h4>Challenge Criteria</h4>
                <textarea 
                  className="form-input" rows="4" 
                  value={detailsForm.challengeCriteria} 
                  onChange={(e) => setDetailsForm({...detailsForm, challengeCriteria: e.target.value})}
                  style={{ width: '100%', marginBottom: '0.5rem' }}
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn-primary" onClick={handleSaveDetails} disabled={isSavingDetails}>
                    {isSavingDetails ? "Saving..." : "Save Details"}
                  </button>
                  <button className="btn-logout" onClick={() => setIsEditingDetails(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div>
                <div className="modal-section">
                  <h4>Campaign Description</h4>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{campaign.description || "No description provided."}</p>
                </div>
                <div className="modal-section">
                  <h4>Challenge Criteria</h4>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{campaign.challengeCriteria}</p>
                </div>
                <button className="btn-logout" style={{marginBottom: '1.5rem'}} onClick={() => setIsEditingDetails(true)}>Edit Details</button>
              </div>
            )
          ) : (
            <>
              <div className="modal-section">
                <h4>Campaign Description</h4>
                <p style={{ whiteSpace: 'pre-wrap' }}>{campaign.description || "No description provided."}</p>
              </div>
              <div className="modal-section">
                <h4>Challenge Criteria</h4>
                <p style={{ whiteSpace: 'pre-wrap' }}>{campaign.challengeCriteria}</p>
              </div>
            </>
          )}

          <div className="modal-section">
            <h4>Wallet Policies (Privy Agent Restrictions)</h4>
            {isManager ? (
              isEditingPolicy ? (
                <div>
                  <textarea 
                    className="form-input" 
                    rows="4" 
                    value={policyText} 
                    onChange={(e) => setPolicyText(e.target.value)}
                    style={{ width: '100%', marginBottom: '0.5rem' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-primary" onClick={handleSavePolicy} disabled={isSaving}>
                      {isSaving ? "Saving..." : "Save Policies"}
                    </button>
                    <button className="btn-logout" onClick={() => setIsEditingPolicy(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div>
                  <pre style={{ background: '#f4f4f4', padding: '1rem', borderRadius: '6px', whiteSpace: 'pre-wrap', fontSize: '0.85rem', color: '#333' }}>
                    {campaign.walletPolicies || "No policies configured."}
                  </pre>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button className="btn-logout" onClick={() => setIsEditingPolicy(true)}>Edit Policies</button>
                    <button className="btn-logout" onClick={handleRefreshAgentAuth} disabled={isRefreshingAgentAuth}>
                      {isRefreshingAgentAuth ? "Refreshing..." : "Refresh Agent Auth Token"}
                    </button>
                  </div>
                </div>
              )
            ) : (
              <pre style={{ background: '#f4f4f4', padding: '1rem', borderRadius: '6px', whiteSpace: 'pre-wrap', fontSize: '0.85rem', color: '#333' }}>
                {campaign.walletPolicies || "No policies configured."}
              </pre>
            )}
          </div>

          {campaign.endDate && (
            <div className="modal-section">
              <h4>Ends On</h4>
              <p>{new Date(campaign.endDate).toLocaleDateString()}</p>
            </div>
          )}
          
          <div className="modal-actions">
            <button className="btn-primary w-full">Join Campaign</button>
          </div>
        </div>
      </div>
    </div>
  );
}
