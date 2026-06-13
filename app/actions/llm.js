"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "../../lib/prisma";
import { CipherSuite, DhkemP256HkdfSha256, HkdfSha256, Aes128Gcm } from "@hpke/core";
import * as crypto from 'crypto';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function generateCampaignChallenge(campaignId) {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error("Campaign not found");

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      This is a giveaway contest. 
      Campaign Name: ${campaign.name}
      Description: ${campaign.description || 'None'}
      Criteria: ${campaign.challengeCriteria}
      
      If the criteria requested is difficult, generate a highly complex and difficult challenge prompt. 
      Return a JSON structure containing:
      1) "challengePrompt": The exact question or challenge the user will see.
      2) "correctAnswer": The exact hidden correct answer.
      3) "winnerSelectionMethod": A recommended method to isolate one winner if multiple users get the correct answer (e.g., "Random Selection", "Most detailed answer").
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);

    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        challengePrompt: parsed.challengePrompt,
        correctAnswer: parsed.correctAnswer,
      }
    });

    return { success: true, data: updated };
  } catch (error) {
    console.error("LLM Generation Error:", error);
    return { success: false, error: error.message };
  }
}

export async function submitCampaignAnswer(campaignId, profileId, answer) {
  try {
    const submission = await prisma.participantSubmission.create({
      data: {
        campaignId,
        profileId,
        answer
      }
    });
    return { success: true, data: submission };
  } catch (error) {
    console.error("Submit Answer Error:", error);
    return { success: false, error: error.message };
  }
}

export async function evaluateAndPayWinners(campaignId) {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { 
         submissions: { include: { profile: true } },
         manager: true
      }
    });
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status === "COMPLETED") return { success: false, error: "Campaign already completed" };

    let winnerWallet = null;
    let winnerId = null;

    if (!campaign.submissions || campaign.submissions.length === 0) {
      console.log(`Campaign ${campaignId}: No submissions. Refunding manager.`);
    } else {
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-pro",
        generationConfig: { responseMimeType: "application/json" }
      });

      const prompt = `
        Here is the list of answers submitted for a giveaway contest.
        Correct Answer: ${campaign.correctAnswer}
        
        Submissions:
        ${JSON.stringify(campaign.submissions.map(s => ({ id: s.id, wallet: s.profile.walletAddress, answer: s.answer })), null, 2)}
        
        1. Identify all correct submissions based on the correct answer.
        2. Choose ONE winner using a fair method to isolate one winner amongst the correct answers.
        3. If NO answers are correct, return null for winnerId and winnerWallet.
        
        Return a JSON structure:
        {
          "winnerId": "The ID of the chosen winning submission or null",
          "winnerWallet": "The wallet address of the winner or null",
          "reasoning": "Why this winner was chosen or why none were chosen"
        }
      `;

      const result = await model.generateContent(prompt);
      const parsed = JSON.parse(result.response.text());

      winnerId = parsed.winnerId;
      winnerWallet = parsed.winnerWallet;
    }

    let payoutRecipient = winnerWallet;
    let refunding = false;

    if (!winnerWallet) {
       // Refund manager
       payoutRecipient = campaign.manager.walletAddress;
       refunding = true;
       console.log(`Campaign ${campaignId}: No correct winner. Refunding manager wallet: ${payoutRecipient}`);
    } else {
       // Mark winner in DB
       await prisma.participantSubmission.update({
         where: { id: winnerId },
         data: { isWinner: true }
       });
    }

    // Execute Payout via Agent Privy Wallet
    const payoutRes = await executeAgentPayout(campaign, payoutRecipient, campaign.rewardAmount);
    if (!payoutRes.success) throw new Error("Payout failed: " + payoutRes.error);

    // Update campaign status
    await prisma.campaign.update({
       where: { id: campaign.id },
       data: { status: "COMPLETED" }
    });

    return { 
      success: true, 
      winner: refunding ? "REFUNDED" : payoutRecipient, 
      txHash: payoutRes.txHash 
    };
  } catch (error) {
    console.error("Evaluation Error:", error);
    return { success: false, error: error.message };
  }
}

async function executeAgentPayout(campaign, recipientWallet, amount) {
  try {
    if (!campaign.agentRefreshToken) throw new Error("Agent not authorized");
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

    // 1. Refresh Token
    const tokenRes = await fetch("https://auth.privy.io/api/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "privy-app-id": appId },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: campaign.agentRefreshToken })
    });
    if (!tokenRes.ok) throw new Error("Failed to refresh token");
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    
    // Update token in DB
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { agentRefreshToken: tokenData.refresh_token }
    });

    // 2. Generate HPKE
    const suite = new CipherSuite({ kem: new DhkemP256HkdfSha256(), kdf: new HkdfSha256(), aead: new Aes128Gcm() });
    const keyPair = await suite.kem.generateKeyPair();
    const publicKeyBytes = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    const publicKeyBase64 = Buffer.from(publicKeyBytes).toString("base64");

    // 3. Authenticate Wallet
    const authRes = await fetch("https://auth.privy.io/api/oauth/v2/wallets/authenticate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "privy-app-id": appId,
        "privy-grant-type": "device_code",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify({ encryption_type: "HPKE", recipient_public_key: publicKeyBase64 })
    });
    if (!authRes.ok) throw new Error("Failed to auth wallet");
    const authData = await authRes.json();
    const wallet = authData.wallets[0];

    // 4. Decrypt Key
    const encapsulatedKey = Buffer.from(authData.encrypted_authorization_key.encapsulated_key, "base64");
    const ciphertext = Buffer.from(authData.encrypted_authorization_key.ciphertext, "base64");
    const recipient = await suite.createRecipientContext({ recipientKey: keyPair.privateKey, enc: encapsulatedKey });
    const decryptedKey = await recipient.open(ciphertext);
    const signature = Buffer.from(decryptedKey).toString("base64");

    // 5. Send TX
    const rpcRes = await fetch(`https://auth.privy.io/api/oauth/v2/wallets/${wallet.id}/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "privy-app-id": appId,
        "privy-grant-type": "device_code",
        "privy-authorization-signature": signature,
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        method: "eth_sendTransaction",
        params: {
          transaction: {
            to: recipientWallet,
            value: `0x${(BigInt(amount) * 10n**18n).toString(16)}`, // Convert USD/ETH float to wei roughly
            chain_id: 5042002
          }
        }
      })
    });

    if (!rpcRes.ok) throw new Error("RPC failed: " + await rpcRes.text());
    const rpcData = await rpcRes.json();
    return { success: true, txHash: rpcData.data?.hash };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
