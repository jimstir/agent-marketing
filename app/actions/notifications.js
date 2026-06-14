"use server";

import { prisma } from "../../lib/prisma";

/**
 * Creates a new transaction notification for a user profile.
 */
export async function createNotification(data) {
  try {
    const { profileId, type, message, campaignId, ethTxHash, fundTxHash } = data;
    
    const notification = await prisma.transactionNotification.create({
      data: {
        profileId,
        type,
        message,
        campaignId,
        ethTxHash,
        fundTxHash
      }
    });
    
    return { success: true, data: notification };
  } catch (error) {
    console.error("Error creating notification:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetches recent notifications for a user profile.
 */
export async function getUserNotifications(profileId) {
  try {
    const notifications = await prisma.transactionNotification.findMany({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    return { success: true, data: notifications };
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return { success: false, error: error.message };
  }
}
