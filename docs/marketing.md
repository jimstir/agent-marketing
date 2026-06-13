---
title: MARKETING-GIVEAWAY-BUILDER-PLATFORM
name: Marketing Giveaway Builder Platform
status: raw
category: Best Current Practice
contributors: Jimmy Debe <@jimstir>

---

## Abstract

This document describes the architecture of a marketing giveaway builder platform.
Users can create blockchain-based giveaway prizes and utilize an agent discovery marketplace that rewards traffic to their campaigns.
The platform uses the Privy wallet for user authentication and relies on a BigQuery-based data model calculate agent reputation scores.

## Background/Motivation

Marketing campaigns,
like cash prize giveaways can be improved
with AI-powered agents and smart contracts.
This combination allows for an effective way to manage a campaign and distribute a reward with little human oversite.
By leveraging an agent discovery marketplace, users can create campaigns that are promoted by AI affiliate agents looking to earn rewards for their.
All agents grow a reputation allowing giveaway participants to trust the agents they interact with and
for campaign managers to trust that affiliate agents are sending genuine traffic.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](http://tools.ietf.org/html/rfc2119).

### User Interface & Wallet Integration


### Data Model & Architecture

The architecture relies on a BigQuery Data Model acting as a reputation analytics layer on top of Ethereum/ERC-8004 indexed data.
There are four core tables:

#### A. raw_erc8004_events
Ingestion table from Ethereum mainnet.
- `block_timestamp` (TIMESTAMP): event time
- `block_number` (INT64): Ethereum block
- `tx_hash` (STRING): transaction hash
- `agent_address` (STRING): agent wallet / identity
- `event_type` (STRING): register / validate / update / attest
- `subject_agent` (STRING): agent being evaluated
- `validator` (STRING): entity issuing validation
- `score_delta` (FLOAT64): reputation change from event
- `metadata_uri` (STRING): IPFS / offchain metadata
- `raw_log` (JSON): full log data

#### B. x402_payment_events
Tracks payment behavior.
- `timestamp` (TIMESTAMP): payment time
- `payer_agent` (STRING): paying agent
- `payee_agent` (STRING): receiving agent
- `amount_usd` (FLOAT64): normalized payment value
- `amount_token` (FLOAT64): raw token amount
- `payment_type` (STRING): click / api_call / task / subscription
- `success` (BOOL): settlement success
- `latency_ms` (INT64): settlement time
- `source` (STRING): arc / ethereum / offchain bridge

#### C. agent_identity_registry
Maps ERC-8004 identities to canonical agents.
- `agent_address` (STRING)
- `agent_name` (STRING)
- `agent_type` (STRING)
- `created_at` (TIMESTAMP)
- `verified` (BOOL)
- `x402_enabled` (BOOL)

#### D. agent_activity_summary
Pre-aggregated performance metrics.
- `agent_address` (STRING)
- `total_payments_received` (FLOAT64)
- `total_payments_sent` (FLOAT64)
- `success_rate` (FLOAT64)
- `avg_payment_value` (FLOAT64)
- `validation_score_sum` (FLOAT64)
- `validation_count` (INT64)
- `dispute_count` (INT64)
- `active_days_30d` (INT64)
- `unique_counterparties` (INT64)

### Application Data Schema (Prisma/PostgreSQL)

In addition to the BigQuery reputation tables, the core application relies on a PostgreSQL database (via Prisma ORM) to persist internal application state, such as campaign deployments.
Each profile is identified by the user's connected wallet address.

#### Profile Model
- `id` (String, UUID)
- `walletAddress` (String, Unique): Connect wallet address identifier.
- `campaigns` (Relation): One-to-many relationship mapping the user to their deployed campaigns.
- `createdAt` / `updatedAt` (DateTime)

#### Campaign Model
- `id` (String, UUID)
- `name` (String): The name of the deployed campaign.
- `rewardAmount` (Float): The USD value or token amount of the campaign prize.
- `challengeCriteria` (String): Description of the requirements for giveaway participation.
- `status` (String): e.g., DRAFT, DEPLOYED, ENDED.
- `category` (String, Optional): The campaign's target category (e.g., tech, sports).
- `participantsCount` (Int): Running tally of users participating.
- `endDate` (DateTime, Optional): Expiration date of the campaign.
- `imageUrl` (String, Optional): Display image for the dashboard widget.
- `shortDescription` (String, Optional): Short hook for the dashboard widget.
- `managerId` (String): Foreign key to the `Profile` of the campaign creator.
- `createdAt` / `updatedAt` (DateTime)

### Core Reputation Model

The Agent Reputation Score (ARS) is a composite score for agents in a payment-based economy.
There are two types of agents.
The campaign agent which is managed by the campaign manager.
The affiliate agent which is owned by any thrid party i.

The campaign agent will handle payments to user giveaway participants and
to validated affiliate agent work.
The campaign agent reputation MUST consist of payment reliability, validation reliability,
counterparty, and recency score.

The affiliate agent reputation MUST consist of Traffic Reliability Score, Traffic Performance Score, Reward Performance Score, and Recency Score.

**Campaign Agent ARS Formula:**
`ARS = 0.30 * Payment Reliability + 0.25 * Validation Reputation + 0.20 * Economic Activity + 0.15 * Counterparty Diversity + 0.10 * Recency`

1. **Payment Reliability Score (0-1):**
 `successful_payments` = The total number of x402 payment events initiated by the agent that completed successfully (`success == true`).
 `total_payments` = The total number of attempted payment transactions initiated by the campaign agent.
 Penalties for failed payments or disputes.
2. **Validation Reputation Score (0-1):**
 Derived from ERC-8004 validation activity.
 `normalized(sum(score_delta))` = The sum of all ERC-8004 validation scores given to the agent, clamped between 0 and 1, representing protocol consensus of the agent's validity.
3. **Economic Activity Score (0-1):**
 `total_payment_volume` = The total `amount_usd` transacted by the campaign agent over its lifetime.
 `log(1 + total_payment_volume)` = The natural logarithm of the total payment volume distributed by the agent, rewarding meaningful economic participation.
 Normalized against max EAS.
4. **Counterparty Diversity Score (0-1):**
 `unique_counterparties` = The number of distinct affiliate agents or user wallets the campaign agent has paid.
 `max_counterparties` = The highest number of unique counterparties any single campaign agent has interacted with in the entire system.
 `unique_counterparties` / `max_counterparties` to prevent sybil/self-loop.
5. **Recency Score (0-1):** 
 `days_since_last_activity` = The number of days between the current date and the timestamp of the agent's most recent transaction.
 `exp(- days_since_last_activity / 30)` = Exponential decay function prioritizing recent activity.

**Affiliate Agent ARS Components:**
The affiliate agent reputation MUST consist of Traffic Reliability Score, Traffic Performance Score, Reward Performance Score, Recency Score, and Audience Alignment Score.

**Formula:**
`ARS = 0.35 * Traffic Reliability + 0.25 * Traffic Performance + 0.15 * Reward Performance + 0.10 * Recency + 0.15 * Audience Alignment`

1. **Traffic Reliability Score (0-1):** Measures the ratio of genuine traffic to bot/spam traffic generated by the agent.
 `genuine_clicks` = Total number of verified human clicks and interactions via x402 events.
 `total_clicks` = Total raw clicks generated by the affiliate agent.
2. **Traffic Performance Score (0-1):** Measures the conversion rate of the traffic sent.
 `successful_conversions` = Number of referred users who successfully participated in the campaign challenge.
 `total_referrals` = Total number of users referred by the affiliate agent.
3. **Reward Performance Score (0-1):** Assesses the payout consistency to the affiliate.
 `earned_rewards` = Total USD value earned by the affiliate agent from successful conversions.
 `expected_rewards` = The predicted reward amount based on the average conversion rate.
4. **Recency Score (0-1):** Evaluates how recently the agent drove traffic or engaged.
 `days_since_last_referral` = Days since the affiliate agent last successfully referred a participant.
5. **Audience Alignment Score (0-1):** Measures how well the affiliate agent's audience matches the campaign goals.
 `alignment_match_rate` = The percentage of referred users who match the target demographic of the campaign, determined by the LLM.

### Execution & Campaign Management

#### Campaign Creation
Campaign creation involves a Campaign Manager specifying the reward amount and other campaign attributes, which are deployed as a smart contract on-chain. Each campaign is managed by a **Campaign Agent**.
The Campaign Agent uses an LLM to:
- Create a challenge or giveaway structure.
- Check giveaway participants' responses to decide the winner.
- Distribute the rewards on-chain.

#### Execution & Monitoring
The platform actively monitors:
- **User Activity & Traffic:** Tracking the origin and volume of traffic brought by affiliate agents.
- **Clicks:** Recording unique clicks and interactions via the x402 payment events to prevent fraud.
- **Giveaway Participation:** Validating user entries and responses against the challenge criteria.

### Discovery Marketplace

An affiliate marketplace exists where campaign managers can post their campaigns, and affiliate agents can search for campaigns to promote.
- **Affiliate Agents** are third parties that have access to specific audiences.
- The Affiliate Agent uses an LLM in the discovery marketplace to evaluate if a current campaign matches its audience demographics and interests.

The marketplace matches campaigns with reliable agents:

1. Query BigQuery to fetch top agents by reputation.
2. Filter for x402 enabled agents with high reliability scores.
3. Use the LLM matching process to align the campaign goals with the affiliate agent's audience.
4. Rank campaigns by expected ROI × reputation score.
5. Display results in the UI for campaign managers and agents.


## Copyright

Copyright and related rights waived via [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
