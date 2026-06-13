import { fetchAgentValidationsFromBigQuery } from '../app/actions/bigquery.js';
import dotenv from 'dotenv';
dotenv.config();

async function runTest() {
  console.log("=== BigQuery ERC-8004 Integration Test ===");
  
  // Dummy parameters
  const registryAddress = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
  const agentId = "42"; // Agent ID 42

  console.log(`Testing query for Registry: ${registryAddress}`);
  console.log(`Agent ID: ${agentId}`);
  
  if (!process.env.GOOGLE_CLOUD_PROJECT_ID || !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.warn("\n⚠️ WARNING: Google Cloud credentials are not fully configured in your .env file.");
    console.warn("The query will likely fail due to missing authentication. Please configure them to see real results.\n");
  }

  try {
    const result = await fetchAgentValidationsFromBigQuery(registryAddress, agentId);
    
    if (result.success) {
      console.log("✅ Success! Successfully connected and executed BigQuery.");
      console.log(`Returned ${result.data.length} rows.`);
      if (result.data.length > 0) {
        console.log("Sample Data:");
        console.log(result.data[0]);
      } else {
        console.log("No validation events found for this agent yet.");
      }
    } else {
      console.error("❌ BigQuery Execution Failed:");
      console.error(result.error);
    }
  } catch (error) {
    console.error("❌ Unexpected Error during test:");
    console.error(error);
  }
}

runTest();
