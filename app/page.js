import TopBar from "./components/TopBar";

export default function Home() {
  return (
    <div className="app-wrapper">
      <TopBar />
      <main className="page-container">
        <section className="hero">
          <h1>Deploy Your Giveaway Campaign</h1>
          <p>
            Create engaging cash giveaways to boost your audience and reward loyal participants.
          </p>
        </section>

        <section className="deployment-card">
          <form className="campaign-form">
            <div className="form-group">
              <label htmlFor="campaign-name">Campaign Name</label>
              <input
                id="campaign-name"
                type="text"
                className="form-input"
                placeholder="e.g. Summer Bonanza Giveaway"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="reward-amount">Reward Amount (USD)</label>
              <input
                id="reward-amount"
                type="number"
                className="form-input"
                placeholder="1000"
                min="1"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="challenge-criteria">Challenge Criteria</label>
              <textarea
                id="challenge-criteria"
                className="form-input"
                placeholder="Describe what users need to do to win (e.g. follow, retweet, refer friends)..."
                rows="4"
                required
              ></textarea>
            </div>

            <button type="button" className="btn-submit">
              Deploy Campaign to Blockchain
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
