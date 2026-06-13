"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { trackReferralClick } from "../actions/affiliates";

export default function ReferralTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode) {
      // Check if we already tracked this in the current session
      const tracked = sessionStorage.getItem(`tracked_ref_${refCode}`);
      if (!tracked) {
        trackReferralClick(refCode).catch(console.error);
        sessionStorage.setItem(`tracked_ref_${refCode}`, "true");
        // Also save it locally so if they participate in a campaign, we know the source
        localStorage.setItem("active_referral_code", refCode);
      }
    }
  }, [searchParams]);

  return null; // Silent component
}
