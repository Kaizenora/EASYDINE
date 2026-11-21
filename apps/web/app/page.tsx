"use client";

import { AuthRedirectGate } from "@/components/marketing/auth-redirect-gate";
import { Features } from "@/components/marketing/features";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { PilotBand } from "@/components/marketing/pilot-band";
import { ShowcaseBand } from "@/components/marketing/showcase-band";

// EasyDine is hosted multi-tenant SaaS, so "/" is always the public product
// page. Signed-in staff are sent on to their dashboard by AuthRedirectGate.
// Motion is plain CSS (globals.css .ed-*), which honours reduced-motion.
export default function MarketingHomePage() {
  return (
    <div className="force-light flex min-h-full flex-col overflow-x-clip bg-background text-foreground">
      <AuthRedirectGate />
      <MarketingNav />
      <main id="main-content">
        <Hero />
        <Features />
        <ShowcaseBand />
        <HowItWorks />
        <PilotBand />
      </main>
      <MarketingFooter />
    </div>
  );
}
