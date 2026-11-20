"use client";

import { MotionConfig } from "motion/react";
import { AuthRedirectGate } from "@/components/marketing/auth-redirect-gate";
import { Features } from "@/components/marketing/features";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { PilotBand } from "@/components/marketing/pilot-band";

// EasyDine is hosted multi-tenant SaaS, so "/" is always the public product
// page. Signed-in staff are sent on to their dashboard by AuthRedirectGate.
export default function MarketingHomePage() {
  return (
    // reducedMotion="user": the hero mock's entrance defers to the OS setting.
    <MotionConfig reducedMotion="user">
      <div className="theme-light flex min-h-full flex-col bg-background text-foreground">
        <AuthRedirectGate />
        <MarketingNav />
        <main id="main-content">
          <Hero />
          <HowItWorks />
          <Features />
          <PilotBand />
        </main>
        <MarketingFooter />
      </div>
    </MotionConfig>
  );
}
