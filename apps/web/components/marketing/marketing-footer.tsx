import { Instagram, Mail } from "lucide-react";
import Link from "next/link";
import { EasyDineMark } from "@/components/brand/easydine-mark";
import { CONTACT_EMAIL, INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/components/marketing/links";

const LINKS = [
  { href: "/login", label: "Sign in" },
  { href: "/docs/accessibility", label: "Accessibility" },
  { href: "/docs/compliance-india", label: "India compliance notes" },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-border px-4 py-12 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 md:flex-row md:justify-between">
        <div>
          <EasyDineMark size={32} />
          <p className="mt-3 text-sm text-muted-foreground">Dine smarter, not harder.</p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 sm:gap-16">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Contact</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="inline-flex items-center gap-2 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  <Mail className="size-4" aria-hidden />
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li>
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  <Instagram className="size-4" aria-hidden />@{INSTAGRAM_HANDLE}
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">EasyDine</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <p className="mx-auto mt-10 max-w-6xl text-xs text-muted-foreground">© {new Date().getFullYear()} EasyDine</p>
    </footer>
  );
}
