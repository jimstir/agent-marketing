"use client";

export default function CampaignModal({ campaign, onClose }) {
  if (!campaign) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{campaign.name}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <div className="modal-stat-row">
            <div className="stat-box">
              <span className="stat-label">Reward Amount</span>
              <span className="stat-value">${campaign.rewardAmount}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Category</span>
              <span className="stat-value">{campaign.category || "General"}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Participants</span>
              <span className="stat-value">{campaign.participantsCount}</span>
            </div>
          </div>

          <div className="modal-section">
            <h4>Challenge Criteria</h4>
            <p>{campaign.challengeCriteria}</p>
          </div>

          {campaign.endDate && (
            <div className="modal-section">
              <h4>Ends On</h4>
              <p>{new Date(campaign.endDate).toLocaleDateString()}</p>
            </div>
          )}
          
          <div className="modal-actions">
            <button className="btn-primary w-full">Join Campaign</button>
          </div>
        </div>
      </div>
    </div>
  );
}
