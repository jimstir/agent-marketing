/**
 * Agent Reputation System (ARS) Scoring Logic
 * Implements the mathematical formulas defined in docs/marketing.md
 */

// Helper to compute exponential decay for recency
function computeRecencyScore(lastActivityAt) {
  if (!lastActivityAt) return 0;
  
  const msInDay = 1000 * 60 * 60 * 24;
  const daysSince = (Date.now() - new Date(lastActivityAt).getTime()) / msInDay;
  
  // exp(-days / 30)
  return Math.max(0, Math.exp(-daysSince / 30));
}

export function calculateAffiliateARS(affiliate, simulatedAlignmentScore = null) {
  // 1. Traffic Reliability
  const trafficReliability = affiliate.totalClicks > 0 
    ? affiliate.genuineClicks / affiliate.totalClicks 
    : 0;

  // 2. Traffic Performance
  const trafficPerformance = affiliate.totalClicks > 0 
    ? affiliate.successfulConversions / affiliate.totalClicks 
    : 0;

  // 3. Reward Performance
  const rewardPerformance = affiliate.expectedRewards > 0 
    ? affiliate.earnedRewards / affiliate.expectedRewards 
    : 0;

  // 4. Recency
  const recency = computeRecencyScore(affiliate.lastActivityAt);

  // 5. Audience Alignment
  // In production, this would be computed by the LLM based on `affiliate.tags` and `affiliate.description`.
  // For the testing harness, we pass a simulated score, or fallback to the DB value.
  const audienceAlignment = simulatedAlignmentScore !== null 
    ? simulatedAlignmentScore 
    : affiliate.audienceAlignmentScore;

  // Formula: ARS = 0.35*TR + 0.25*TP + 0.15*RP + 0.10*RC + 0.15*AA
  const ars = 
    (0.35 * trafficReliability) +
    (0.25 * trafficPerformance) +
    (0.15 * rewardPerformance) +
    (0.10 * recency) +
    (0.15 * audienceAlignment);

  return {
    trafficReliabilityScore: trafficReliability,
    trafficPerformanceScore: trafficPerformance,
    rewardPerformanceScore: rewardPerformance,
    recencyScore: recency,
    audienceAlignmentScore: audienceAlignment,
    overallReputationScore: Math.min(Math.max(ars, 0), 1) // Clamp 0-1
  };
}

export function calculateCampaignARS(campaign, globalMaxCounterparties, globalMaxVolume) {
  // 1. Payment Reliability
  const paymentReliability = campaign.totalPayments > 0 
    ? campaign.successfulPayments / campaign.totalPayments 
    : 0;

  // 2. Validation Reputation
  // Clamp sum between 0 and 1
  const validationReputation = Math.min(Math.max(campaign.validationScoreSum, 0), 1);

  // 3. Economic Activity
  const logAgentVolume = Math.log1p(campaign.totalPaymentVolume);
  const logMaxVolume = Math.log1p(Math.max(globalMaxVolume, campaign.totalPaymentVolume));
  const economicActivity = logMaxVolume > 0 ? logAgentVolume / logMaxVolume : 0;

  // 4. Counterparty Diversity
  const maxCounterparties = Math.max(globalMaxCounterparties, campaign.uniqueCounterparties);
  const counterpartyDiversity = maxCounterparties > 0 
    ? campaign.uniqueCounterparties / maxCounterparties 
    : 0;

  // 5. Recency
  const recency = computeRecencyScore(campaign.lastActivityAt);

  // Formula: ARS = 0.30*PR + 0.25*VR + 0.20*EA + 0.15*CD + 0.10*RC
  const ars = 
    (0.30 * paymentReliability) +
    (0.25 * validationReputation) +
    (0.20 * economicActivity) +
    (0.15 * counterpartyDiversity) +
    (0.10 * recency);

  return {
    paymentReliabilityScore: paymentReliability,
    validationReputationScore: validationReputation,
    economicActivityScore: economicActivity,
    counterpartyDiversityScore: counterpartyDiversity,
    campaignRecencyScore: recency,
    overallReputationScore: Math.min(Math.max(ars, 0), 1) // Clamp 0-1
  };
}
