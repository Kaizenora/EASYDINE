import Link from "next/link";
import { EasyDineWordmark } from "@/components/brand/easydine-logo";
import { CONTACT_EMAIL, INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/components/marketing/links";

const SITE_MAP = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/login", label: "Sign in" },
  { href: "/docs/accessibility", label: "Accessibility" },
  { href: "/docs/compliance-india", label: "India compliance notes" },
];

const linkClass = "text-[14px] font-light text-foreground/75 transition-colors duration-200 hover:text-foreground";

export function MarketingFooter() {
  return (
    <footer className="mt-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-12 px-6 py-16 sm:flex-row sm:justify-between">
        <div className="max-w-xs">
          <EasyDineWordmark height={26} />
          <p className="mt-4 text-[16px] leading-snug text-foreground/85">Dine smarter, not harder.</p>
        </div>

        <div className="grid grid-cols-2 gap-12 sm:gap-16">
          <div>
            <h2 className="font-heading text-[15px] font-medium text-foreground">Site map</h2>
            <ul className="mt-4 space-y-3">
              {SITE_MAP.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkClass}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-heading text-[15px] font-medium text-foreground">Socials</h2>
            <ul className="mt-4 space-y-3">
              <li>
                <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  Instagram <span className="text-foreground/50">@{INSTAGRAM_HANDLE}</span>
                </a>
              </li>
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`} className={`${linkClass} break-all`}>
                  {CONTACT_EMAIL}
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-foreground/80">
        <p className="px-6 py-4 text-center text-[13px] text-foreground/80">© {new Date().getFullYear()} EasyDine</p>
      </div>
    </footer>
  );
}
