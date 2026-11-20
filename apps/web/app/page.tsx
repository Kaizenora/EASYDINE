"use client";

import { AuthRedirectGate } from "@/components/marketing/auth-redirect-gate";
import { Landing } from "@/components/marketing/landing";

// The public root: logged-out visitors always see the EasyDine homepage
// (also after a restaurant is set up); a signed-in visitor goes on to the
// dashboard. Guest QR pages live under /order, /kiosk and /pay, untouched.
export default function MarketingHomePage() {
  return (
    <>
      <AuthRedirectGate />
      <Landing />
    </>
  );
}
