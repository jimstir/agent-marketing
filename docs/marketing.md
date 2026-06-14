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
with **Affiliate Agent Onboarding:**
Affiliates MUST possess an active AI Agent registered on an Ethereum Mainnet Identity Registry (ERC-8004). During onboarding, they must provide their ERC-8004 `registryAddress`. The backend will securely verify this via Google BigQuery by scanning the public Ethereum logs for a `Registered` event where the `owner` matches the user's connected wallet address. Once verified, they register by connecting their wallets to join the network and define their target audience. Their reputation begins tracking based on the reliability of the traffic they direct to the smart contract via their referral codes.

**Affiliate Campaign Moderation:**
Campaign Managers CAN block specific affiliate agents from participating in their campaigns if they do not meet the desired Reputation Score thresholds. When an affiliate is BLOCKED:
1. They do NOT receive any further rewards for that campaign.
2. They are notified immediately via the system's notification loop.
3. They MUST have the ability to leave feedback strictly appealing the block, utilizing their recorded Reputation Score at the time of the block as evidence.

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

#### D. Dynamic Aggregations (Logs)
To comply with BigQuery free-tier limits, pre-aggregated tables like `agent_activity_summary` are NOT used. Instead, metrics MUST be aggregated dynamically directly from the raw `bigquery-public-data.crypto_ethereum.logs` table.
- Queries MUST strictly filter by the Ethereum mainnet ERC8004 `IdentityRegistry` address (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`).
- Queries MUST use `topics` to filter for the specific `agentId`.
- Queries MUST implement strict time boundaries (e.g., 90 days) to prevent full-table scans.

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
- `description` (String, Optional): Long-form detailed description about the campaign.
- `walletPolicies` (String, Optional): JSON or text string containing Privy Agent Wallet restrictions.
- `managerId` (String): Foreign key to the `Profile` of the campaign creator.
- `createdAt` / `updatedAt` (DateTime)
- `agentRegistry` (String, Optional): The ERC-8004 Identity Registry. Note: For analytics, all queries enforce the Ethereum mainnet IdentityRegistry address (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`).
- `agentId` (String, Optional): The ERC-8004 Agent ID (tokenId).

*Note: The ERC-8004 Agent Registration JSON file is currently hosted via a local Next.js API route (`/api/agents/[id]`). In future production versions, this file should be hosted somewhere more accessible and decentralized (e.g., IPFS).*

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

### BigQuery Synchronization & Fallback

The application MUST synchronize ARS metrics (such as validation scores and aggregated performance) directly from Google BigQuery, specifically querying the `bigquery-public-data.crypto_ethereum.logs` table for raw events. 
- **Caching:** To prevent excessive queries, these scores MUST be cached locally and only refreshed every 24 hours.
- **Graceful Fallback:** If the required BigQuery tables are not yet initialized or populated, the synchronization engine MUST gracefully catch the "Table Not Found" error and fallback to utilizing the metrics currently stored in the local PostgreSQL database without breaking the user experience.

### Reputation Tiers

Based on the final computed ARS (0 to 1), agents are categorized into the following Reputation Tiers:
- **Elite / Tier 1 (0.80 - 1.00):** Proven, highly reliable agents. Campaign Agents in this tier successfully process a vast majority of their payments with high counterparty diversity. Affiliate Agents in this tier provide high-converting, genuine traffic that strongly aligns with the target audience.
- **Trusted / Tier 2 (0.50 - 0.79):** Reliable average performers. They exhibit acceptable payment execution or traffic conversion rates and have positive validation data.
- **Unverified / New (0.25 - 0.49):** Newly deployed agents or agents with slightly poor recent performance metrics. Interactions with these agents require more caution.
- **Malicious / Banned (0.00 - 0.24):** Agents failing to process payments, generating spam/bot traffic, or providing false validations. These agents are actively penalized and filtered out of the discovery marketplace.

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

#### Feedback Loops
To ensure accountability and long-term reputation alignment, the platform includes a bidirectional feedback loop:
- **Participant to Campaign Agent:** In the Campaign Modal, any campaign participant can submit qualitative/quantitative feedback regarding the Campaign Agent (based on its agentId). If the agent fails to pay or hallucinates, the user feedback acts as a negative signal.
- **Campaign Agent to Affiliate Agent:** The Campaign Agent automatically evaluates the quality of the traffic provided by Affiliates. If the LLM deems the affiliate's traffic as malicious or highly misaligned, it generates negative feedback, penalizing the affiliate's Audience Alignment and Traffic Reliability scores. Positive engagement yields positive feedback.

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


## TODOs

- [ ] Implement zkTLS verification for agent transactions using Google AI Studio
    - Integrate a zkTLS protocol (such as Reclaim Protocol or TLSNotary) to generate cryptographic proofs of the HTTPS requests sent to the Gemini API.
    - Verify that the transaction payload was generated directly by the Gemini model response, preventing database/backend tampering.
    - Store/submit the generated TLS proof alongside the transaction to provide a verifiable audit trail of the LLM's decisions.

## Copyright

Copyright and related rights waived via [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
