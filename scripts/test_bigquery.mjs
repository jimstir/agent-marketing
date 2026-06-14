import { BigQuery } from '@google-cloud/bigquery';
import 'dotenv/config';

// Must match the mainnet contract addresses used in the project
const ERC8004_IDENTITY_REGISTRY_MAINNET = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

async function runTests() {
  console.log("=== BigQuery ERC-8004 Integration Test ===\n");

  if (!process.env.GOOGLE_CLOUD_PROJECT_ID) {
    console.error("❌ Error: GOOGLE_CLOUD_PROJECT_ID is not set in your .env file.");
    console.error("Please add it and set GOOGLE_APPLICATION_CREDENTIALS before running this test.");
    return;
  }

  const bigquery = new BigQuery({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  });

  console.log("✅ BigQuery Client Initialized using project:", process.env.GOOGLE_CLOUD_PROJECT_ID);

  try {
    console.log("\n--- Test 1: Verify Agent Ownership (Registered Event) ---");
    // We will test if ANY Registered event exists just to ensure the query format works.
    // Keccak-256 hash of "Registered(uint256,string,address)"
    const registeredTopicHash = "0x89e1d882d27b9c9f7d2f9540b615c10edb8931eb628a86a6cfb1ef9d273111f1";

    // Test with a dummy address, or without the owner filter just to see if the table responds.
    // To strictly match the project's logic, we use the exact query but we'll use a dummy address.
    const dummyOwnerAddress = "0x1234567890123456789012345678901234567890";
    const cleanAddress = dummyOwnerAddress.replace(/^0x/i, '').toLowerCase();
    const ownerAddressHexPadded = '0x' + cleanAddress.padStart(64, '0');

    const ownershipQuery = `
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
        AND topics[SAFE_OFFSET(2)] = @ownerAddressHexPadded
      LIMIT 1
    `;

    console.log("Executing ownership query against:", ERC8004_IDENTITY_REGISTRY_MAINNET);
    const [ownershipJob] = await bigquery.createQueryJob({
      query: ownershipQuery,
      params: {
        registryAddress: ERC8004_IDENTITY_REGISTRY_MAINNET,
        registeredTopicHash: registeredTopicHash,
        ownerAddressHexPadded: ownerAddressHexPadded
      }
    });

    const [ownershipRows] = await ownershipJob.getQueryResults();
    console.log(`✅ Ownership Query successful. Rows returned: ${ownershipRows.length}`);
    if (ownershipRows.length > 0) console.log(ownershipRows[0]);


    console.log("\n--- Test 2: Sync Campaign Reputation (Validation metrics) ---");
    // Simulate campaign reputation aggregation over the last 90 days
    const dummyAgentId = "1";
    const agentIdHex = BigInt(dummyAgentId).toString(16);
    const agentIdHexPadded = '0x' + agentIdHex.padStart(64, '0');

    const metricsQuery = `
      SELECT 
        SUM(CAST(data AS INT64)) as validation_score_sum, 
        COUNT(*) as total_payments_sent, 
        COUNT(DISTINCT topics[SAFE_OFFSET(2)]) as unique_counterparties
      FROM \`bigquery-public-data.crypto_ethereum.logs\`
      WHERE address = LOWER(@registryAddress)
        AND DATE(block_timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        AND topics[SAFE_OFFSET(1)] = @agentIdHexPadded
    `;

    console.log("Executing metrics query against:", ERC8004_IDENTITY_REGISTRY_MAINNET);
    const [metricsJob] = await bigquery.createQueryJob({
      query: metricsQuery,
      params: {
        registryAddress: ERC8004_IDENTITY_REGISTRY_MAINNET,
        agentIdHexPadded: agentIdHexPadded
      }
    });

    const [metricsRows] = await metricsJob.getQueryResults();
    console.log(`✅ Metrics Query successful. Results:`);
    console.log(metricsRows);

  } catch (error) {
    console.error("\n❌ BigQuery Test Failed:", error);
  }
}

runTests();
