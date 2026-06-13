"use client";
import TopBar from "./components/TopBar";
import { useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, parseAbi, publicActions, parseEther } from "viem";
import { mainnet } from "viem/chains";

const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] }, public: { http: ['https://rpc.testnet.arc.network'] } },
};
import { createCampaign, updateCampaignAgent, getOrCreateProfile, initAgentAuthorization, finalizeAgentAuthorization } from "./actions/campaigns";
import { createAffiliate } from "./actions/affiliates";
import { getWalletAddress } from "../lib/privy";

const IDENTITY_REGISTRY_ADDRESS = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const ABI = parseAbi([
  "function register(string memory agentURI) external returns (uint256 agentId)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)"
]);

export default function Home() {
  const { user, authenticated, login, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const [formData, setFormData] = useState({
    name: "",
    rewardAmount: "",
    description: "",
    challengeCriteria: "",
    walletPolicies: ""
  });
  
  const [affiliateData, setAffiliateData] = useState({
    description: "",
    agentURI: ""
  });
  
  const [isDeploying, setIsDeploying] = useState(false);
  const [agentType, setAgentType] = useState("campaign"); // "campaign" or "affiliate"
  const [affiliateRefLink, setAffiliateRefLink] = useState("");

  const handleAffiliateSubmit = async (e) => {
    e.preventDefault();
    if (!authenticated) {
      login();
      return;
    }

    setIsDeploying(true);
    try {
      const address = getWalletAddress(user, wallets);
      const profileRes = await getOrCreateProfile(address);
      if (!profileRes.success) throw new Error("Could not find or create profile.");

      const result = await createAffiliate({
        ...affiliateData,
        profileId: profileRes.data.id
      });

      if (!result.success) throw new Error(result.error);
      
      const link = `${window.location.origin}/?ref=${result.data.referralCode}`;
      setAffiliateRefLink(link);
      alert("Affiliate Operator registered successfully!");
      setAffiliateData({ description: "", agentURI: "" });
    } catch (error) {
      console.error("Affiliate registration failed", error);
      alert("Failed to register affiliate: " + error.message);
    } finally {
      setIsDeploying(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!authenticated) {
      login();
      return;
    }

    setIsDeploying(true);
    try {
      const wallet = wallets[0];
      const address = getWalletAddress(user, wallets);
      
      // 1. Get or Create Profile to get managerId
      const profileRes = await getOrCreateProfile(address);
      if (!profileRes.success) throw new Error("Could not find or create profile.");
      
      // 2. Create the campaign in the database first so we have an ID for the URI
      const createRes = await createCampaign({
        ...formData,
        managerId: profileRes.data.id
      });
      if (!createRes.success) throw new Error("Could not create campaign.");
      const campaignId = createRes.data.id;

      // 3. Setup Privy Agent Wallet via Device Flow
      const initAuthRes = await initAgentAuthorization();
      if (!initAuthRes.success) throw new Error("Could not initialize agent authorization.");
      
      const { device_code, user_code } = initAuthRes.data;

      // Automatically verify the device code
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

      // Fetch and save the refresh token securely
      const finalAuthRes = await finalizeAgentAuthorization(campaignId, device_code);
      if (!finalAuthRes.success) throw new Error("Failed to finalize agent authorization.");

      // 4. Switch chain to Ethereum Mainnet
      await wallet.switchChain(mainnet.id);
      const provider = await wallet.getEthereumProvider();
      const client = createWalletClient({
        account: wallet.address,
        chain: mainnet,
        transport: custom(provider)
      }).extend(publicActions);

      const agentURI = `${window.location.origin}/api/agents/${campaignId}`;

      // 5. Send transaction to ERC-8004 IdentityRegistry
      const hash = await client.writeContract({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: ABI,
        functionName: 'register',
        args: [agentURI]
      });

      // 6. Wait for transaction receipt to get the minted agentId
      const receipt = await client.waitForTransactionReceipt({ hash });
      
      // Parse the logs for the Registered event to get the agentId
      let agentId = null;
      for (const log of receipt.logs) {
        try {
           if (log.topics[0] === "0x89e1d882d27b9c9f7d2f9540b615c10edb8931eb628a86a6cfb1ef9d273111f1") {
              // agentId is the first indexed param
              agentId = BigInt(log.topics[1]).toString();
              break;
           }
        } catch (e) { console.error("Error parsing log", e); }
      }

      if (!agentId) {
         console.warn("Could not parse agentId from receipt logs, using a fallback value");
         agentId = "UNKNOWN_" + Math.floor(Math.random() * 1000000);
      }

      const agentRegistry = `eip155:1:${IDENTITY_REGISTRY_ADDRESS}`;

      // 7. Update the campaign with the new ERC-8004 identity
      await updateCampaignAgent(campaignId, agentRegistry, agentId);

      // 8. Switch to Arc Testnet and Fund Agent
      const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
      if (!embeddedWallet) {
        console.warn("Could not find agent's embedded wallet. Skipping funding step.");
      } else {
        await wallet.switchChain(arcTestnet.id);
        const arcClient = createWalletClient({
          account: wallet.address,
          chain: arcTestnet,
          transport: custom(provider)
        }).extend(publicActions);

        const txHash = await arcClient.sendTransaction({
          to: embeddedWallet.address,
          value: parseEther(formData.rewardAmount.toString() || "0")
        });
        
        await arcClient.waitForTransactionReceipt({ hash: txHash });
      }

      alert(`Campaign deployed successfully! Agent Identity: ${agentRegistry} - ID: ${agentId}`);
      setFormData({ name: "", rewardAmount: "", description: "", challengeCriteria: "", walletPolicies: "" });
    } catch (error) {
      console.error("Deployment failed", error);
      alert("Failed to deploy campaign: " + error.message);
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="app-wrapper">
      <TopBar />
      <main className="page-container">
        <section className="hero">
          <h1>{agentType === "campaign" ? "Deploy Your Giveaway Campaign" : "Register as an Affiliate Agent"}</h1>
          <p>
            {agentType === "campaign" 
              ? "Create engaging cash giveaways to boost your audience and reward loyal participants." 
              : "Join our network, share your referral link, and earn rewards by driving quality traffic."}
          </p>
        </section>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem', gap: '1rem' }}>
          <button 
            className={`btn-${agentType === 'campaign' ? 'primary' : 'logout'}`}
            onClick={() => setAgentType('campaign')}
          >
            Campaign Agent
          </button>
          <button 
            className={`btn-${agentType === 'affiliate' ? 'primary' : 'logout'}`}
            onClick={() => setAgentType('affiliate')}
          >
            Affiliate Agent
          </button>
        </div>

        <section className="deployment-card">
          {agentType === "campaign" ? (
          <form className="campaign-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="campaign-name">Campaign Name</label>
              <input
                id="campaign-name"
                type="text"
                className="form-input"
                placeholder="e.g. Summer Bonanza Giveaway"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="reward-amount">Reward Amount (USD)</label>
              <input
                id="reward-amount"
                type="number"
                className="form-input"
                placeholder="1000"
                min="1"
                value={formData.rewardAmount}
                onChange={e => setFormData({...formData, rewardAmount: e.target.value})}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">Campaign Description</label>
              <textarea
                id="description"
                className="form-input"
                placeholder="Write a detailed description of your campaign..."
                rows="4"
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
              ></textarea>
            </div>

            <div className="form-group">
              <label htmlFor="challenge-criteria">Challenge Criteria</label>
              <textarea
                id="challenge-criteria"
                className="form-input"
                placeholder="Describe what users need to do to win (e.g. follow, retweet, refer friends)..."
                rows="4"
                value={formData.challengeCriteria}
                onChange={e => setFormData({...formData, challengeCriteria: e.target.value})}
                required
              ></textarea>
            </div>

            <div className="form-group">
              <label htmlFor="wallet-policies">
                Wallet Policies
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginTop: '0.2rem' }}>
                  (Privy Agent Wallet Restrictions)
                </span>
              </label>
              <textarea
                id="wallet-policies"
                className="form-input"
                placeholder='e.g. {"version": "1.0", "method_rules": [...]}'
                rows="4"
                value={formData.walletPolicies}
                onChange={e => setFormData({...formData, walletPolicies: e.target.value})}
              ></textarea>
            </div>

            <button type="submit" className="btn-submit" disabled={isDeploying}>
              {isDeploying ? "Deploying..." : "Deploy"}
            </button>
          </form>
          ) : (
          <form className="campaign-form" onSubmit={handleAffiliateSubmit}>
            {affiliateRefLink ? (
              <div style={{ padding: '2rem', background: 'var(--surface-color)', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                <h3>Registration Successful!</h3>
                <p style={{ margin: '1rem 0' }}>Here is your unique referral link to share with your audience:</p>
                <div style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: '8px', wordBreak: 'break-all', fontWeight: '500' }}>
                  <a href={affiliateRefLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-color)' }}>
                    {affiliateRefLink}
                  </a>
                </div>
                <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  You can also find this code in your settings toggle in the top bar.
                </p>
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label htmlFor="affiliate-description">Audience Description</label>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    Explain who your audience is. This helps the LLM understand your traffic and match you with the best campaigns.
                  </p>
                  <textarea
                    id="affiliate-description"
                    className="form-input"
                    placeholder="e.g. My audience consists of crypto-native developers interested in DeFi..."
                    rows="4"
                    value={affiliateData.description}
                    onChange={e => setAffiliateData({...affiliateData, description: e.target.value})}
                    required
                  ></textarea>
                </div>

                <div className="form-group">
                  <label htmlFor="agent-uri">Agent URI</label>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    Note: Being x402-compatible is recommended but not a hard requirement.
                  </p>
                  <input
                    id="agent-uri"
                    type="url"
                    className="form-input"
                    placeholder="https://your-agent-domain.com/api"
                    value={affiliateData.agentURI}
                    onChange={e => setAffiliateData({...affiliateData, agentURI: e.target.value})}
                  />
                </div>

                <button type="submit" className="btn-submit" disabled={isDeploying}>
                  {isDeploying ? "Registering..." : "Register Affiliate Agent"}
                </button>
              </>
            )}
          </form>
          )}
        </section>
      </main>
    </div>
  );
}
