import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function GET(request, { params }) {
  const { agentId } = params;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: agentId } // we mapped campaignId to the API agentId param
    });

    if (!campaign) {
      return NextResponse.json({ error: "Agent identity not found" }, { status: 404 });
    }

    // Following ERC-8004 Spec Registration File Format
    const agentJson = {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: campaign.name,
      description: campaign.description || campaign.challengeCriteria || "Campaign Agent",
      services: [
        {
          name: "Dashboard",
          endpoint: "https://example.com/dashboard", // placeholder until real domain
        },
        {
          name: "ProtectedData",
          endpoint: "https://example.com/api/agent-data"
        }
      ],
      registrations: []
    };

    if (campaign.agentRegistry && campaign.agentId) {
      agentJson.registrations.push({
        agentId: parseInt(campaign.agentId),
        agentRegistry: campaign.agentRegistry
      });
    }

    return NextResponse.json(agentJson);
  } catch (error) {
    console.error("Error fetching agent json:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
