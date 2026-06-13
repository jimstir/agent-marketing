"use server";

import { prisma } from "../../lib/prisma";

export async function fetchCampaigns({ page = 1, limit = 12 }) {
  try {
    const skip = (page - 1) * limit;
    
    const campaigns = await prisma.campaign.findMany({
      skip,
      take: limit,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        manager: true,
      }
    });

    const totalCount = await prisma.campaign.count();
    
    return {
      success: true,
      data: campaigns,
      hasMore: skip + limit < totalCount,
    };
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    return { success: false, data: [], hasMore: false, error: "Failed to fetch campaigns" };
  }
}

export async function updateCampaignPolicies(campaignId, newPolicies) {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error("Campaign not found");

    let parsedPolicies;
    try {
      parsedPolicies = JSON.parse(newPolicies);
    } catch (e) {
      throw new Error("Invalid JSON policy format. Must be a valid JSON object.");
    }

    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    
    if (!appId || !appSecret) {
       console.warn("Missing Privy credentials in environment variables.");
       // Fallback to just saving in DB if no secret is set for local testing
       const updated = await prisma.campaign.update({
         where: { id: campaignId },
         data: { walletPolicies: newPolicies },
       });
       return { success: true, data: updated };
    }

    const authHeader = `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`;
    let privyPolicyId = campaign.privyPolicyId;

    if (privyPolicyId) {
      // Update existing policy in Privy
      const response = await fetch(`https://api.privy.io/v1/policies/${privyPolicyId}`, {
        method: "PATCH",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/json",
          "privy-app-id": appId
        },
        body: JSON.stringify(parsedPolicies)
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Privy API update failed: ${errorText}`);
      }
    } else {
      // Create new policy in Privy
      const payload = {
        name: `${campaign.name.substring(0, 50)} Policy`,
        ...parsedPolicies
      };
      
      const response = await fetch(`https://api.privy.io/v1/policies`, {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/json",
          "privy-app-id": appId
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Privy API create failed: ${errorText}`);
      }
      const responseData = await response.json();
      privyPolicyId = responseData.id;
    }

    // Save local update
    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: { 
        walletPolicies: newPolicies,
        privyPolicyId: privyPolicyId 
      },
    });
    return { success: true, data: updated };
  } catch (error) {
    console.error("Error updating policies:", error);
    return { success: false, error: error.message || "Failed to update policies" };
  }
}

export async function updateCampaignDetails(campaignId, data) {
  try {
    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        ...(data.description !== undefined && { description: data.description }),
        ...(data.challengeCriteria !== undefined && { challengeCriteria: data.challengeCriteria }),
      },
    });
    return { success: true, data: updated };
  } catch (error) {
    console.error("Error updating campaign details:", error);
    return { success: false, error: "Failed to update campaign details" };
  }
}

export async function getOrCreateProfile(address) {
  try {
    let profile = await prisma.profile.findUnique({ where: { walletAddress: address } });
    if (!profile) {
      profile = await prisma.profile.create({
        data: { walletAddress: address, name: "New User" }
      });
    }
    return { success: true, data: profile };
  } catch (error) {
    console.error("Error with profile:", error);
    return { success: false, error: "Failed to get profile" };
  }
}

export async function createCampaign(data) {
  try {
    const campaign = await prisma.campaign.create({
      data: {
        name: data.name,
        rewardAmount: data.rewardAmount ? parseFloat(data.rewardAmount) : 0,
        description: data.description,
        challengeCriteria: data.challengeCriteria,
        walletPolicies: data.walletPolicies,
        managerId: data.managerId, 
      }
    });
    return { success: true, data: campaign };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
}

export async function updateCampaignAgent(campaignId, agentRegistry, agentId) {
  try {
     const campaign = await prisma.campaign.update({
        where: { id: campaignId },
        data: { agentRegistry, agentId }
     });
     return { success: true, data: campaign };
  } catch(e) {
     return { success: false, error: e.message };
  }
}

export async function initAgentAuthorization() {
  try {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    if (!appId) throw new Error("Missing Privy App ID");

    const response = await fetch("https://auth.privy.io/api/oauth/v2/device_authorization", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "privy-app-id": appId
      },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Device authorization failed: ${errorText}`);
    }

    const data = await response.json();
    // Return device_code and user_code to the frontend
    return { success: true, data };
  } catch (error) {
    console.error("Error initiating agent authorization:", error);
    return { success: false, error: error.message };
  }
}

export async function getAllCampaignsForSelect() {
  try {
    const campaigns = await prisma.campaign.findMany({
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' }
    });
    return { success: true, data: campaigns };
  } catch (error) {
    console.error("Error fetching campaigns for select", error);
    return { success: false, error: error.message };
  }
}

export async function finalizeAgentAuthorization(campaignId, deviceCode) {
  try {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    if (!appId) throw new Error("Missing Privy App ID");

    // Poll the token endpoint
    // We expect the frontend has already verified the user_code
    const response = await fetch("https://auth.privy.io/api/oauth/v2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "privy-app-id": appId
      },
      body: JSON.stringify({
        grant_type: "device_code",
        device_code: deviceCode
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Token fetch failed: ${errorData.error}`);
    }

    const data = await response.json();
    
    if (data.refresh_token) {
      const updated = await prisma.campaign.update({
        where: { id: campaignId },
        data: { agentRefreshToken: data.refresh_token }
      });
      return { success: true, data: updated };
    }

    throw new Error("No refresh token received");
  } catch (error) {
    console.error("Error finalizing agent authorization:", error);
    return { success: false, error: error.message };
  }
}

export async function getCampaignAffiliates(campaignId) {
  try {
    const links = await prisma.affiliateLink.findMany({
      where: { campaignId },
      include: {
        affiliate: {
          include: {
            profile: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return { success: true, data: links };
  } catch (error) {
    console.error("Error fetching campaign affiliates:", error);
    return { success: false, error: error.message };
  }
}

export async function blockAffiliateLink(linkId) {
  try {
    const link = await prisma.affiliateLink.update({
      where: { id: linkId },
      data: { status: "BLOCKED" },
      include: { affiliate: true, campaign: true }
    });

    // Create notification for the affiliate
    await prisma.transactionNotification.create({
      data: {
        profileId: link.affiliate.profileId,
        campaignId: link.campaignId,
        type: "MODERATION",
        message: `Your affiliate access for campaign '${link.campaign.name}' has been BLOCKED due to low Reputation Score. You will not receive further rewards. You may appeal this decision using your current score: ${(link.affiliate.overallReputationScore * 100).toFixed(1)}%.`
      }
    });

    return { success: true, data: link };
  } catch (error) {
    console.error("Error blocking affiliate:", error);
    return { success: false, error: error.message };
  }
}
