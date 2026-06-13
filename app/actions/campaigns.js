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
