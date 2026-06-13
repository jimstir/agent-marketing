"use client";
import { useState, useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { getWalletAddress } from "../../lib/privy";
import { updateCampaignPolicies, updateCampaignDetails, initAgentAuthorization, finalizeAgentAuthorization, getOrCreateProfile, getCampaignAffiliates, blockAffiliateLink } from "../actions/campaigns";
import { getAffiliateProfile, createAffiliateLink } from "../actions/affiliates";
import { syncCampaignReputation } from "../actions/bigquery";
import { submitCampaignAnswer, evaluateAndPayWinners } from "../actions/llm";

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

  const [isJoining, setIsJoining] = useState(false);
  const [generatedLink, setGeneratedLink] = useState(null);
  
  const [repScore, setRepScore] = useState(campaign?.overallReputationScore || 0);
  const [affiliates, setAffiliates] = useState([]);
  
  const [answerInput, setAnswerInput] = useState("");
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  useEffect(() => {
    async function init() {
      const res = await syncCampaignReputation(campaign.id);
      if (res.success) {
        setRepScore(res.data.overallReputationScore);
      }
      
      const isManagerLocal = address && campaign.manager?.walletAddress && address.toLowerCase() === campaign.manager.walletAddress.toLowerCase();
      if (isManagerLocal) {
        const affRes = await getCampaignAffiliates(campaign.id);
        if (affRes.success) {
          setAffiliates(affRes.data);
        }
      }
    }
    init();
  }, [campaign.id, address, campaign.manager?.walletAddress]);

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

  const handleJoinCampaign = async () => {
    if (!authenticated) return alert("Please connect wallet first.");
    setIsJoining(true);
    try {
      const profileRes = await getOrCreateProfile(address);
      if (!profileRes.success) throw new Error("Could not find profile.");
      
      const affRes = await getAffiliateProfile(profileRes.data.id);
      if (!affRes.success || !affRes.data) {
        throw new Error("You must register as an Affiliate Agent first to join campaigns.");
      }

      const linkRes = await createAffiliateLink(affRes.data.id, campaign.id);
      if (!linkRes.success) throw new Error(linkRes.error);

      setGeneratedLink(`${window.location.origin}/?ref=${linkRes.data.referralCode}`);
    } catch (e) {
      alert("Failed to join campaign: " + e.message);
    } finally {
      setIsJoining(false);
    }
  };

  const handleBlockAffiliate = async (linkId) => {
    if (!confirm("Are you sure you want to block this affiliate? They will no longer receive rewards for this campaign.")) return;
    const res = await blockAffiliateLink(linkId);
    if (res.success) {
      setAffiliates(prev => prev.map(a => a.id === linkId ? { ...a, status: "BLOCKED" } : a));
    } else {
      alert("Failed to block affiliate: " + res.error);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!authenticated) return alert("Please connect wallet first.");
    if (!answerInput.trim()) return alert("Please enter an answer.");
    setIsSubmittingAnswer(true);
    try {
      const profileRes = await getOrCreateProfile(address);
      if (!profileRes.success) throw new Error("Could not find profile.");
      
      const res = await submitCampaignAnswer(campaign.id, profileRes.data.id, answerInput);
      if (res.success) {
         alert("Answer submitted successfully! Waiting for evaluation.");
         setAnswerInput("");
      } else {
         throw new Error(res.error);
      }
    } catch (e) {
      alert("Failed to submit answer: " + e.message);
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  const handleEvaluate = async () => {
    if (!confirm("Are you sure you want to evaluate answers? This will trigger a payout!")) return;
    setIsEvaluating(true);
    try {
       const res = await evaluateAndPayWinners(campaign.id);
       if (res.success) {
          alert(`Winner chosen! Paid out to ${res.winner}. TX Hash: ${res.txHash}`);
       } else {
          throw new Error(res.error);
       }
    } catch (e) {
       alert("Evaluation failed: " + e.message);
    } finally {
       setIsEvaluating(false);
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
            <div className="stat-box">
              <span className="stat-label">Reputation</span>
              <span className="stat-value">{(repScore * 100).toFixed(1)}%</span>
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
                
                {campaign.challengePrompt && (
                  <div className="modal-section" style={{ background: '#f0f9ff', padding: '1rem', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                    <h4 style={{ color: '#0369a1' }}>Active Challenge</h4>
                    <p style={{ fontWeight: 'bold', fontSize: '1.1rem', margin: '0.5rem 0' }}>{campaign.challengePrompt}</p>
                    <div style={{ marginTop: '1rem', background: '#e0f2fe', padding: '0.75rem', borderRadius: '6px' }}>
                       <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Hidden Correct Answer:</span>
                       <span style={{ fontSize: '0.85rem', marginLeft: '0.5rem' }}>{campaign.correctAnswer}</span>
                    </div>
                  </div>
                )}
                
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
              
              {campaign.challengePrompt && (
                <div className="modal-section" style={{ background: '#fdf4ff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #fbcfe8' }}>
                  <h4 style={{ color: '#a21caf', textAlign: 'center' }}>Complete the Challenge!</h4>
                  <p style={{ fontWeight: 'bold', fontSize: '1.1rem', textAlign: 'center', margin: '1rem 0' }}>{campaign.challengePrompt}</p>
                  <textarea 
                    className="form-input" 
                    rows="3" 
                    placeholder="Enter your answer here..." 
                    value={answerInput}
                    onChange={(e) => setAnswerInput(e.target.value)}
                    style={{ width: '100%', marginBottom: '1rem' }}
                  />
                  <button className="btn-primary" style={{ width: '100%' }} onClick={handleSubmitAnswer} disabled={isSubmittingAnswer}>
                    {isSubmittingAnswer ? "Submitting..." : "Submit Answer"}
                  </button>
                </div>
              )}
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

          {isManager && affiliates.length > 0 && (
            <div className="modal-section">
              <h4>Manage Affiliates</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                {affiliates.map(link => (
                  <div key={link.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9f9f9', padding: '0.75rem', borderRadius: '6px', border: '1px solid #eee' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{link.affiliate.profile.name || "Affiliate"} ({link.affiliate.registryAddress ? link.affiliate.registryAddress.slice(0, 8) + '...' : 'Unknown'})</div>
                      <div style={{ fontSize: '0.8rem', color: '#666' }}>Reputation Score: {(link.affiliate.overallReputationScore * 100).toFixed(1)}% | Status: {link.status}</div>
                    </div>
                    {link.status !== "BLOCKED" && (
                      <button className="btn-logout" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => handleBlockAffiliate(link.id)}>
                        Block Agent
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {campaign.endDate && (
            <div className="modal-section">
              <h4>Ends On</h4>
              <p>{new Date(campaign.endDate).toLocaleDateString()}</p>
            </div>
          )}
          
          <div className="modal-actions" style={{ flexDirection: 'column', alignItems: 'center' }}>
            {generatedLink ? (
              <div style={{ background: '#e6ffe6', color: '#006600', padding: '1rem', borderRadius: '8px', border: '1px solid #00cc00', width: '100%', textAlign: 'center' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>You joined this campaign!</p>
                <input type="text" className="form-input" value={generatedLink} readOnly style={{ width: '100%', fontSize: '0.85rem', padding: '0.5rem', textAlign: 'center' }} onClick={(e) => e.target.select()} />
              </div>
            ) : (
              <button className="btn-primary w-full" onClick={handleJoinCampaign} disabled={isJoining}>
                {isJoining ? "Joining..." : "Join Campaign"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
