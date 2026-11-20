import Link from "next/link";
import { EasyDineWordmark } from "@/components/brand/easydine-logo";
import { DEMO_HREF } from "@/components/marketing/links";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="EasyDine home" className="rounded-lg">
          <EasyDineWordmark height={26} />
        </Link>

        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <a
            href="#how-it-works"
            className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:inline-flex"
          >
            How it works
          </a>
          <a
            href="#features"
            className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:inline-flex"
          >
            Features
          </a>
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Sign in
          </Link>
          <a
            href={DEMO_HREF}
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Book a demo
          </a>
        </nav>
      </div>
    </header>
  );
}
