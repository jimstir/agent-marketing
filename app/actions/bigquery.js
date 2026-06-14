"use server";

import { BigQuery } from '@google-cloud/bigquery';

const ERC8004_IDENTITY_REGISTRY_MAINNET = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const ERC8004_REPUTATION_REGISTRY_MAINNET = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";

/**
 * Initializes the BigQuery client.
 * Requires GOOGLE_CLOUD_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS to be set in .env.
 */
const getBigQueryClient = () => {
  if (!process.env.GOOGLE_CLOUD_PROJECT_ID) {
    console.warn("BigQuery Client not fully configured: GOOGLE_CLOUD_PROJECT_ID missing.");
  }
  
  return new BigQuery({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    // Google Cloud automatically looks for the GOOGLE_APPLICATION_CREDENTIALS env variable
    // which should point to the absolute path of your service account JSON file.
  });
};

/**
 * Queries Google BigQuery's public Ethereum dataset to retrieve ERC-8004 validation events
 * for a specific Identity Registry and Agent ID.
 * 
 * @param {string} registryAddress - The ERC-8004 Identity Registry contract address (e.g., '0x8004...')
 * @param {string} agentId - The uint256 Agent ID assigned to the campaign or affiliate
 */
export async function fetchAgentValidationsFromBigQuery(registryAddress, agentId) {
  try {
    const bigquery = getBigQueryClient();
    
    // ERC-8004 validation event signature hash (Example structure)
    // In a real scenario, this would be the Keccak-256 hash of the Validation event signature,
    // e.g., ValidationSubmitted(uint256 indexed agentId, address indexed validator, uint8 score)
    // We'll use a placeholder topic hash here.
    const validationTopicHash = "0x...[ERC8004_VALIDATION_EVENT_HASH]...";

    // BigQuery SQL targeting the public ethereum logs table
    const query = `
      SELECT
        block_timestamp,
        transaction_hash,
        data,
        topics
      FROM
        \`bigquery-public-data.crypto_ethereum.logs\`
      WHERE
        address = LOWER(@registryAddress)
        AND DATE(block_timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        AND topics[SAFE_OFFSET(0)] = @validationTopicHash
        -- topic 1 is usually the indexed agentId (padded to 32 bytes)
        AND topics[SAFE_OFFSET(1)] = @agentIdHexPadded
      ORDER BY
        block_timestamp DESC
      LIMIT 100
    `;

    // Convert the integer agentId to a 32-byte hex string required for topic matching
    const agentIdHex = BigInt(agentId).toString(16);
    const agentIdHexPadded = '0x' + agentIdHex.padStart(64, '0');

    const options = {
      query: query,
      params: {
        registryAddress: registryAddress,
        validationTopicHash: validationTopicHash,
        agentIdHexPadded: agentIdHexPadded
      },
    };

    console.log(`Executing BigQuery for Agent ID: ${agentId} at Registry: ${registryAddress}`);
    const [job] = await bigquery.createQueryJob(options);
    const [rows] = await job.getQueryResults();

    return {
      success: true,
      data: rows
    };
  } catch (error) {
    console.error("BigQuery fetch failed:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Queries Google BigQuery to verify if a specific owner address has emitted
 * a 'Registered' event on the given ERC-8004 Identity Registry.
 * 
 * @param {string} registryAddress - The ERC-8004 Identity Registry contract address.
 * @param {string} ownerAddress - The wallet address of the user.
 */
export async function verifyAgentOwnershipFromBigQuery(registryAddress, ownerAddress) {
  try {
    const bigquery = getBigQueryClient();
    
    // Keccak-256 hash of "Registered(uint256,string,address)"
    const registeredTopicHash = "0x89e1d882d27b9c9f7d2f9540b615c10edb8931eb628a86a6cfb1ef9d273111f1";

    const query = `
      SELECT
        block_timestamp,
        transaction_hash,
        topics
      FROM
        \`bigquery-public-data.crypto_ethereum.logs\`
      WHERE
        address = LOWER(@registryAddress)
        AND DATE(block_timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        AND topics[SAFE_OFFSET(0)] = @registeredTopicHash
        -- topic 2 is the indexed owner address padded to 32 bytes
        AND topics[SAFE_OFFSET(2)] = @ownerAddressHexPadded
      LIMIT 1
    `;

    // Convert the owner address to a 32-byte padded hex string (remove '0x', pad left to 64 chars, add '0x')
    const cleanAddress = ownerAddress.replace(/^0x/i, '').toLowerCase();
    const ownerAddressHexPadded = '0x' + cleanAddress.padStart(64, '0');

    const options = {
      query: query,
      params: {
        registryAddress: registryAddress,
        registeredTopicHash: registeredTopicHash,
        ownerAddressHexPadded: ownerAddressHexPadded
      },
    };

    console.log(`Executing BigQuery Ownership Check for Owner: ${ownerAddress} at Registry: ${registryAddress}`);
    const [job] = await bigquery.createQueryJob(options);
    const [rows] = await job.getQueryResults();

    return {
      success: true,
      hasAgent: rows.length > 0,
      data: rows[0] || null
    };
  } catch (error) {
    console.error("BigQuery ownership verification failed:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

import { prisma } from '../../lib/prisma';
import { calculateCampaignARS, calculateAffiliateARS } from '../../lib/scoring';

export async function syncCampaignReputation(campaignId) {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) return { success: false, error: "Campaign not found" };

    if (campaign.lastReputationSync) {
      const msInDay = 24 * 60 * 60 * 1000;
      if (Date.now() - new Date(campaign.lastReputationSync).getTime() < msInDay) {
        return { success: true, data: campaign };
      }
    }

    try {
      const bigquery = getBigQueryClient();
      
      const agentIdHex = BigInt(campaign.agentId || '0').toString(16);
      const agentIdHexPadded = '0x' + agentIdHex.padStart(64, '0');

      const query = `
        SELECT 
          SUM(CAST(data AS INT64)) as validation_score_sum, 
          COUNT(*) as total_payments_sent, 
          COUNT(DISTINCT topics[SAFE_OFFSET(2)]) as unique_counterparties
        FROM \`bigquery-public-data.crypto_ethereum.logs\`
        WHERE address = LOWER(@registryAddress)
          AND DATE(block_timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
          AND topics[SAFE_OFFSET(1)] = @agentIdHexPadded
      `;
      const [job] = await bigquery.createQueryJob({ 
        query, 
        params: { 
          registryAddress: ERC8004_IDENTITY_REGISTRY_MAINNET,
          agentIdHexPadded 
        }
      });
      const [rows] = await job.getQueryResults();
      if (rows.length > 0) {
        campaign.validationScoreSum = rows[0].validation_score_sum || campaign.validationScoreSum;
        campaign.totalPaymentVolume = rows[0].total_payments_sent || campaign.totalPaymentVolume;
        campaign.uniqueCounterparties = rows[0].unique_counterparties || campaign.uniqueCounterparties;
      }
    } catch (e) {
      console.warn("BigQuery missing or failed, falling back to local DB metrics.", e.message);
    }

    const maxAgg = await prisma.campaign.aggregate({ _max: { totalPaymentVolume: true, uniqueCounterparties: true } });
    const globalMaxVolume = maxAgg._max.totalPaymentVolume || 1;
    const globalMaxCounterparties = maxAgg._max.uniqueCounterparties || 1;

    const scores = calculateCampaignARS(campaign, globalMaxCounterparties, globalMaxVolume);

    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        ...scores,
        validationScoreSum: campaign.validationScoreSum,
        totalPaymentVolume: campaign.totalPaymentVolume,
        uniqueCounterparties: campaign.uniqueCounterparties,
        lastReputationSync: new Date()
      }
    });

    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function syncAffiliateReputation(affiliateId) {
  try {
    const affiliate = await prisma.affiliate.findUnique({ where: { id: affiliateId } });
    if (!affiliate) return { success: false, error: "Affiliate not found" };

    if (affiliate.lastReputationSync) {
      const msInDay = 24 * 60 * 60 * 1000;
      if (Date.now() - new Date(affiliate.lastReputationSync).getTime() < msInDay) {
        return { success: true, data: affiliate };
      }
    }

    try {
      const bigquery = getBigQueryClient();

      const agentIdHex = BigInt(affiliate.registryAddress || '0').toString(16);
      const agentIdHexPadded = '0x' + agentIdHex.padStart(64, '0');

      const query = `
        SELECT 
          (SUM(CAST(data AS INT64)) / NULLIF(COUNT(*), 0)) as success_rate
        FROM \`bigquery-public-data.crypto_ethereum.logs\`
        WHERE address = LOWER(@registryAddress)
          AND DATE(block_timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
          AND topics[SAFE_OFFSET(1)] = @agentIdHexPadded
      `;
      const [job] = await bigquery.createQueryJob({ 
        query, 
        params: { 
          registryAddress: ERC8004_IDENTITY_REGISTRY_MAINNET,
          agentIdHexPadded 
        }
      });
      const [rows] = await job.getQueryResults();
      // Mock metrics update for affiliates based on BQ
      if (rows.length > 0) {
        affiliate.trafficReliabilityScore = rows[0].success_rate || affiliate.trafficReliabilityScore;
      }
    } catch (e) {
      console.warn("BigQuery missing or failed, falling back to local DB metrics.", e.message);
    }

    const scores = calculateAffiliateARS(affiliate);

    const updated = await prisma.affiliate.update({
      where: { id: affiliateId },
      data: {
        ...scores,
        lastReputationSync: new Date()
      }
    });

    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
