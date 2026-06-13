import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

// This endpoint is meant to be called by the Agent itself to fetch its scoped data
export async function POST(request) {
  try {
    const body = await request.json();
    const { agentRegistry, agentId, apiKey } = body;

    // Simple placeholder authentication for the agent making the request
    if (apiKey !== process.env.NEXT_PUBLIC_GOOGLE_GEMINI_API_KEY && !process.env.NEXT_PUBLIC_GOOGLE_GEMINI_API_KEY) {
      // Allow unauthenticated for now if no key set, but in production we'd verify agent signatures
    }

    if (!agentRegistry || !agentId) {
      return NextResponse.json({ error: "Missing agentRegistry or agentId" }, { status: 400 });
    }

    const campaign = await prisma.campaign.findFirst({
      where: {
        agentRegistry: agentRegistry,
        agentId: String(agentId)
      }
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found for this agent identity" }, { status: 404 });
    }

    // Only return the data relevant for the agent's operation
    return NextResponse.json({
      success: true,
      data: {
        challengeCriteria: campaign.challengeCriteria,
        walletPolicies: campaign.walletPolicies,
        description: campaign.description
      }
    });

  } catch (error) {
    console.error("Error fetching agent data:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
