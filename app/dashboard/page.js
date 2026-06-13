import TopBar from "../components/TopBar";
import CampaignGrid from "../components/CampaignGrid";
import { fetchCampaigns } from "../actions/campaigns";

export default async function DashboardPage() {
  const initialData = await fetchCampaigns({ page: 1, limit: 12 });

  return (
    <div className="app-wrapper">
      <TopBar />
      <main className="dashboard-container">
        <header className="dashboard-header">
          <h1>Giveaway Marketplace</h1>
          <p>Discover campaigns that match your audience and start earning.</p>
        </header>

        <CampaignGrid 
          initialCampaigns={initialData.data || []} 
          initialHasMore={initialData.hasMore || false} 
        />
      </main>
    </div>
  );
}
