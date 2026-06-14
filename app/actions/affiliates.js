"use server";

import { prisma } from "../../lib/prisma";

export async function createAffiliate(data) {
  try {
    const { profileId, description, tags, registryAddress, initialCampaignId } = data;
    
    const affiliate = await prisma.affiliate.create({
      data: {
        profileId,
        description,
        tags,
        registryAddress
      }
    });

    let linkData = null;
    if (initialCampaignId) {
      const linkRes = await createAffiliateLink(affiliate.id, initialCampaignId);
      if (linkRes.success) {
        linkData = linkRes.data;
      }
    }

    return { success: true, data: { affiliate, linkData } };
  } catch (error) {
    console.error("Error creating affiliate:", error);
    return { success: false, error: error.message };
  }
}

export async function trackReferralClick(referralCode) {
  try {
    if (!referralCode) return { success: false, error: "No code provided" };
    
    // Increment totalClicks
    await prisma.affiliate.update({
      where: { referralCode },
      data: { totalClicks: { increment: 1 } }
    });
    
    return { success: true };
  } catch (error) {
    console.error("Error tracking referral click:", error);
    return { success: false, error: error.message };
  }
}

export async function createAffiliateLink(affiliateId, campaignId) {
  try {
    const existing = await prisma.affiliateLink.findUnique({
      where: { affiliateId_campaignId: { affiliateId, campaignId } }
    });
    if (existing) return { success: true, data: existing };

    const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const link = await prisma.affiliateLink.create({
      data: {
        affiliateId,
        campaignId,
        referralCode
      },
      include: {
        campaign: {
          select: { name: true }
        }
      }
    });
    return { success: true, data: link };
  } catch (error) {
    console.error("Error creating affiliate link", error);
    return { success: false, error: error.message };
  }
}

export async function getAffiliateLinks(affiliateId) {
  try {
    const links = await prisma.affiliateLink.findMany({
      where: { affiliateId },
      include: {
        campaign: {
          select: { name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return { success: true, data: links };
  } catch (error) {
    console.error("Error fetching affiliate links", error);
    return { success: false, error: error.message };
  }
}

export async function getAffiliateProfile(profileId) {
  try {
    const affiliate = await prisma.affiliate.findUnique({
      where: { profileId }
    });
    return { success: true, data: affiliate };
  } catch (error) {
    console.error("Error fetching affiliate profile:", error);
    return { success: false, error: error.message };
  }
}

export async function submitAppeal(linkId, message) {
  try {
    const link = await prisma.affiliateLink.findUnique({
      where: { id: linkId },
      include: { affiliate: true, campaign: true }
    });
    if (!link || link.status !== "BLOCKED") throw new Error("Invalid or unblocked link");

    await prisma.transactionNotification.create({
      data: {
        profileId: link.campaign.managerId,
        campaignId: link.campaignId,
        type: "APPEAL",
        message: `Affiliate ${link.affiliate.profileId} has appealed their block on '${link.campaign.name}'. Score at block time: ${(link.affiliate.overallReputationScore * 100).toFixed(1)}%. Message: ${message}`
      }
    });

    return { success: true };
  } catch (error) {
    console.error("Error submitting appeal:", error);
    return { success: false, error: error.message };
  }
}
