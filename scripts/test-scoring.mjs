import { calculateAffiliateARS, calculateCampaignARS } from '../lib/scoring.js';

function runAffiliateTests() {
  console.log("=== Affiliate Agent ARS Tests ===\n");

  const today = new Date();
  
  // Persona 1: High Quality Performer
  // - Brings lots of traffic, highly genuine, high conversions, aligns with audience perfectly
  const highQuality = {
    totalClicks: 1000,
    genuineClicks: 950,
    successfulConversions: 250,
    expectedRewards: 1250, // 250 conversions * $5
    earnedRewards: 1250,
    lastActivityAt: today,
    audienceAlignmentScore: 0.95 
  };

  // Persona 2: Bot / Spam Farm
  // - High clicks, mostly bots, low conversions
  const botFarm = {
    totalClicks: 5000,
    genuineClicks: 100,
    successfulConversions: 5,
    expectedRewards: 25,
    earnedRewards: 25,
    lastActivityAt: today,
    audienceAlignmentScore: 0.10 // Poor alignment since bots
  };

  // Persona 3: Inactive / Average Affiliate
  // - Okay stats, but hasn't had activity in 60 days
  const sixtyDaysAgo = new Date(today.getTime() - (60 * 24 * 60 * 60 * 1000));
  const inactiveAgent = {
    totalClicks: 500,
    genuineClicks: 400,
    successfulConversions: 40,
    expectedRewards: 200,
    earnedRewards: 200,
    lastActivityAt: sixtyDaysAgo,
    audienceAlignmentScore: 0.80
  };

  console.table({
    "High Quality Performer": calculateAffiliateARS(highQuality),
    "Bot/Spam Farm": calculateAffiliateARS(botFarm),
    "Inactive Agent (60d)": calculateAffiliateARS(inactiveAgent),
  });
}

function runCampaignTests() {
  console.log("\n=== Campaign Agent ARS Tests ===\n");
  
  const today = new Date();
  const globalMaxCounterparties = 1000;
  const globalMaxVolume = 50000;

  // Persona 1: Whale Campaign
  // - Pays everyone consistently, massive volume, high diversity, good validation
  const whaleCampaign = {
    totalPayments: 500,
    successfulPayments: 500,
    validationScoreSum: 0.9,
    totalPaymentVolume: 25000,
    uniqueCounterparties: 450,
    lastActivityAt: today
  };

  // Persona 2: Rug Pull / Failing Campaign
  // - Lots of attempted payments, but they fail (e.g. no gas, logic error), bad validation
  const rugPull = {
    totalPayments: 100,
    successfulPayments: 10,
    validationScoreSum: 0.1,
    totalPaymentVolume: 50,
    uniqueCounterparties: 10,
    lastActivityAt: today
  };

  // Persona 3: New Campaign
  // - Just launched, tiny volume, a few payments
  const newCampaign = {
    totalPayments: 5,
    successfulPayments: 5,
    validationScoreSum: 0.5,
    totalPaymentVolume: 100,
    uniqueCounterparties: 5,
    lastActivityAt: today
  };

  console.table({
    "Whale Campaign": calculateCampaignARS(whaleCampaign, globalMaxCounterparties, globalMaxVolume),
    "Rug Pull": calculateCampaignARS(rugPull, globalMaxCounterparties, globalMaxVolume),
    "New Campaign": calculateCampaignARS(newCampaign, globalMaxCounterparties, globalMaxVolume),
  });
}

function main() {
  runAffiliateTests();
  runCampaignTests();
}

main();
