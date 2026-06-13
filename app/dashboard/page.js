import TopBar from "../components/TopBar";
import CampaignGrid from "../components/CampaignGrid";
import { fetchCampaigns } from "../actions/campaigns";
import DashboardNotifications from "../components/DashboardNotifications";

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

        {/* Notifications will be loaded via Client Component so we can use Privy React Auth to get the wallet address */}
        <DashboardNotifications />

        <CampaignGrid 
          initialCampaigns={initialData.data || []} 
          initialHasMore={initialData.hasMore || false} 
        />
      </main>
    </div>
  );
}
