import { CipherSuite, DhkemP256HkdfSha256, HkdfSha256, Aes128Gcm } from "@hpke/core";
import { PrismaClient } from "@prisma/client";
import * as crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const campaignId = process.argv[2];
  if (!campaignId) {
    console.error("Usage: node scripts/test-agent.mjs <campaign-id>");
    process.exit(1);
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || !campaign.agentRefreshToken) {
    console.error("Campaign not found or agent not authorized.");
    process.exit(1);
  }

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  console.log("1. Exchanging refresh token for access token...");
  const tokenRes = await fetch("https://auth.privy.io/api/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", "privy-app-id": appId },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: campaign.agentRefreshToken })
  });

  if (!tokenRes.ok) throw new Error("Failed to refresh token: " + await tokenRes.text());
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  const newRefreshToken = tokenData.refresh_token;

  // Update token in DB
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { agentRefreshToken: newRefreshToken }
  });

  console.log("2. Generating HPKE Key Pair...");
  const suite = new CipherSuite({
    kem: new DhkemP256HkdfSha256(),
    kdf: new HkdfSha256(),
    aead: new Aes128Gcm(),
  });
  
  const keyPair = await suite.kem.generateKeyPair();
  const publicKeyBytes = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const publicKeyBase64 = Buffer.from(publicKeyBytes).toString("base64");

  console.log("3. Authenticating wallet to get ephemeral signing key...");
  const authRes = await fetch("https://auth.privy.io/api/oauth/v2/wallets/authenticate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "privy-app-id": appId,
      "privy-grant-type": "device_code",
      "Authorization": `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      encryption_type: "HPKE",
      recipient_public_key: publicKeyBase64
    })
  });

  if (!authRes.ok) throw new Error("Failed to authenticate wallet: " + await authRes.text());
  const authData = await authRes.json();
  
  const wallet = authData.wallets[0];
  console.log(`Agent Wallet Address: ${wallet.address}`);

  console.log("4. Decrypting ephemeral signing key...");
  const encapsulatedKey = Buffer.from(authData.encrypted_authorization_key.encapsulated_key, "base64");
  const ciphertext = Buffer.from(authData.encrypted_authorization_key.ciphertext, "base64");

  const recipient = await suite.createRecipientContext({
    recipientKey: keyPair.privateKey,
    enc: encapsulatedKey
  });

  const decryptedKey = await recipient.open(ciphertext);
  const signature = Buffer.from(decryptedKey).toString("base64");

  console.log("5. Sending 0 USDC transaction on Arc Testnet...");
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
          to: wallet.address, // Send to self
          value: "0x0",
          chain_id: 5042002
        }
      }
    })
  });

  if (!rpcRes.ok) throw new Error("Transaction failed: " + await rpcRes.text());
  const rpcData = await rpcRes.json();
  console.log("Transaction Result:", rpcData);
  console.log(`Success! Sent test transaction on Arc Testnet. TX Hash: ${rpcData.data?.hash}`);
}

main().catch(console.error);
