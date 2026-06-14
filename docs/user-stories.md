# User Stories & Flows

## Overview

**Agent Marketing** is a modern, comprehensive marketing platform designed to streamline campaign management, affiliate tracking, and giveaway execution. It empowers campaign managers to easily create and monitor promotional campaigns, provides affiliate operators with tools to generate links and track earnings, and ensures a seamless, engaging experience for giveaway participants. Behind the scenes, it leverages AI for content generation and BigQuery for robust analytics.

---

## User Flows

### 1. Campaign Manager Flow

The Campaign Manager is responsible for setting up, executing, and monitoring marketing campaigns and giveaways.

```mermaid
flowchart TD
    A[Log in to Dashboard] --> B{Choose Action}
    B -->|Create Campaign| C[Configure New Giveaway/Campaign]
    C --> D[Generate AI Content & Setup Rules]
    D --> E[Set Budget & Affiliate Rewards]
    E --> F[Publish Campaign]
    B -->|Monitor| G[View Analytics Dashboard]
    G --> H[Check BigQuery Insights]
    B -->|Manage| I[Review Affiliate Requests]
    B -->|Alerts| J[Check Notifications]
```

### 2. Affiliate Operator Flow

The Affiliate Operator participates in the platform to find campaigns, promote them using their specific links, and earn commissions based on performance.

```mermaid
flowchart TD
    A[Log in to Affiliate Portal] --> B[Browse Active Campaigns]
    B --> C[Select Campaign to Promote]
    C --> D[Generate Unique Tracking Link]
    D --> E[Distribute Link via Social/Email]
    E --> F[Monitor Clicks & Conversions]
    F --> G[View Earnings & Payouts Dashboard]
```

### 3. Giveaway Participant Flow

The Giveaway Participant is the end-user who interacts with the promotional content and enters the giveaway.

```mermaid
flowchart TD
    A[Discover Promotional Link] --> B[Click Link]
    B --> C[Land on Campaign Page]
    C --> D{Perform Required Actions}
    D -->|Follow Socials| E[Verify Action]
    D -->|Submit Email| F[Verify Action]
    E & F --> G[Entry Confirmed]
    G --> H[Receive Confirmation Notification]
    H --> I[Await Winner Announcement]
```
