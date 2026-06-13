"use server";

import { PrismaClient } from "@prisma/client";

const prisma = globalThis.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;

export async function createAffiliate(data) {
  try {
    const { profileId, description, agentURI } = data;
    
    // Generate a random 6-character alphanumeric referral code
    const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const affiliate = await prisma.affiliate.create({
      data: {
        profileId,
        description,
        agentURI,
        referralCode
      }
    });
    
    return { success: true, data: affiliate };
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
