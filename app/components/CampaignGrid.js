"use client";

import { useState, useEffect, useRef } from "react";
import { fetchCampaigns } from "../actions/campaigns";
import CampaignModal from "./CampaignModal";

export default function CampaignGrid({ initialCampaigns, initialHasMore }) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  
  const [selectedCampaign, setSelectedCampaign] = useState(null);

  const loaderRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => {
      if (loaderRef.current) observer.unobserve(loaderRef.current);
    };
  }, [hasMore, isLoading, page]);

  const loadMore = async () => {
    setIsLoading(true);
    const nextPage = page + 1;
    const result = await fetchCampaigns({ page: nextPage, limit: 12 });
    
    if (result.success) {
      setCampaigns((prev) => [...prev, ...result.data]);
      setHasMore(result.hasMore);
      setPage(nextPage);
    }
    setIsLoading(false);
  };

  const handleOpenModal = (campaign) => {
    setSelectedCampaign(campaign);
  };

  const handleCloseModal = () => {
    setSelectedCampaign(null);
  };

  return (
    <>
      <div className="campaign-grid">
        {campaigns.map((campaign) => (
          <div 
            key={campaign.id} 
            className="campaign-widget"
            onClick={() => handleOpenModal(campaign)}
          >
            <div className="widget-header">
              <h3>{campaign.name}</h3>
              <span className="badge">{campaign.status}</span>
            </div>
            
            <p className="widget-desc">
              {campaign.shortDescription || campaign.challengeCriteria.slice(0, 80) + "..."}
            </p>
            
            <div className="widget-footer">
              <div className="reward">
                <span className="label">Reward:</span>
                <span className="amount">${campaign.rewardAmount}</span>
              </div>
              {campaign.participantsCount > 0 && (
                <div className="participants">
                  {campaign.participantsCount} joined
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="loader-container" ref={loaderRef}>
          {isLoading ? <p>Loading more campaigns...</p> : <p>Scroll to load more</p>}
        </div>
      )}

      {selectedCampaign && (
        <CampaignModal campaign={selectedCampaign} onClose={handleCloseModal} />
      )}
    </>
  );
}
