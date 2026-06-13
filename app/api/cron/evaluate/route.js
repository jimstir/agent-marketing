import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { evaluateAndPayWinners } from '../../../actions/llm';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    // Check for authorization header if desired, skipping for local dev ease.

    // Find all active campaigns where endDate has passed
    const expiredCampaigns = await prisma.campaign.findMany({
      where: {
        status: "DEPLOYED",
        endDate: {
          lte: new Date()
        }
      }
    });

    if (expiredCampaigns.length === 0) {
      return NextResponse.json({ message: "No expired campaigns found." });
    }

    const results = [];
    for (const campaign of expiredCampaigns) {
       console.log(`Cron: Evaluating expired campaign ${campaign.id}...`);
       const res = await evaluateAndPayWinners(campaign.id);
       results.push({ id: campaign.id, result: res });
    }

    return NextResponse.json({ success: true, processed: results.length, results });
  } catch (error) {
    console.error("Cron evaluation failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
