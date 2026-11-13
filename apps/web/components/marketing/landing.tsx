import {
  ArrowRight,
  ChefHat,
  ClipboardList,
  Languages,
  Printer,
  QrCode,
  Receipt,
  ShieldCheck,
  Users,
  WifiOff,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { EasyDineWordmark } from "@/components/brand/easydine-logo";

// The public EasyDine homepage for logged-out visitors. Original copy; the
// screenshots are of the EasyDine app itself (demo data). Only features the
// product really has are listed: no reviews, client counts or pricing.

const STEPS = [
  {
    title: "Create your account",
    body: "Sign up with your restaurant's name. Every new account is reviewed by EasyDine before it goes live.",
  },
  {
    title: "Add your menu and tables",
    body: "Set up categories, items, prices and tax, then add tables and print a QR code for each one.",
  },
  {
    title: "Take orders and print",
    body: "Ring up orders at the counter or let guests order from the table QR. Kitchen tickets and bills print on your thermal printers.",
  },
];

const FEATURES = [
  { icon: Receipt, title: "Cashier POS", body: "Dine-in and takeaway billing with tax, discounts and cash, card or UPI payments." },
  { icon: QrCode, title: "QR table ordering", body: "Guests scan the table QR, browse the menu and send their order straight to the kitchen." },
  { icon: ChefHat, title: "Kitchen display", body: "Tickets appear on the KDS as they are placed; cooks move each one from new to ready." },
  { icon: Printer, title: "KOT and bill printing", body: "58 mm and 80 mm thermal printers, with separate printers for the kitchen and the cashier." },
  { icon: WifiOff, title: "Safe through outages", body: "An order sent during a network drop is kept and sent once, without duplicates." },
  { icon: Users, title: "Customers and staff", body: "Saved customers, staff roles and PIN sign-in, so each person sees only their own screens." },
  { icon: ClipboardList, title: "Tables and reservations", body: "A live floor view of every table, plus bookings for the evening rush." },
  { icon: Languages, title: "English, Hindi, Marathi", body: "Guest menus and staff screens are available in three languages." },
];

const SHOTS = [
  { src: "/screenshots/tables-light.png", alt: "EasyDine tables screen showing the floor with table status", title: "Tables" },
  { src: "/screenshots/kds-light.png", alt: "EasyDine kitchen display showing order tickets", title: "Kitchen display" },
  { src: "/screenshots/dashboard-light.png", alt: "EasyDine dashboard with the day's sales summary", title: "Dashboard" },
];

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="EasyDine home" className="flex items-center">
          <EasyDineWordmark height={30} />
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="#how-it-works" className="hover:text-foreground">How it works</a>
          <a href="#features" className="hover:text-foreground">Features</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-foreground hover:bg-secondary"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:bg-[var(--primary-hover)]"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

export function Landing() {
  return (
    <div className="force-light flex min-h-full flex-col bg-background text-foreground [color-scheme:light]">
      <Nav />
      <main id="main-content" className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 md:grid-cols-[1.05fr_1fr] md:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
              Restaurant POS, kitchen and QR ordering
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.5rem]">
              Run the whole restaurant from <span className="text-primary">one easy screen.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              EasyDine brings billing, table QR orders, the kitchen display and thermal printing together, so
              orders move from the guest to the kitchen to the bill without retyping.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm hover:bg-[var(--primary-hover)]"
              >
                Request an account <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-input bg-card px-6 text-base font-semibold text-foreground hover:bg-secondary"
              >
                Sign in
              </Link>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">New accounts are activated after a quick review.</p>
          </div>
          <div className="relative">
            <div className="absolute -inset-3 -z-10 rounded-[2rem] bg-primary/10 blur-2xl" aria-hidden />
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
              <Image
                src="/screenshots/pos-light.png"
                alt="The EasyDine cashier POS with menu items and an order in the cart"
                width={1440}
                height={900}
                priority
                className="h-auto w-full"
              />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-y border-border/70 bg-card/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">From sign-up to the first printed bill in three steps.</p>
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl border border-border bg-background p-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">Everything the floor and kitchen need</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">Built for busy counters, small kitchens and shared tablets.</p>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-2xl border border-border bg-card p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <f.icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Screens */}
        <section className="border-t border-border/70 bg-card/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight">See the screens</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">Real EasyDine screens, shown with demo data.</p>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {SHOTS.map((s) => (
                <figure key={s.src} className="overflow-hidden rounded-2xl border border-border bg-background">
                  <Image src={s.src} alt={s.alt} width={1440} height={900} className="h-auto w-full" />
                  <figcaption className="border-t border-border px-4 py-3 text-sm font-medium">{s.title}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-primary px-6 py-10 text-primary-foreground sm:px-10 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ready to set up your restaurant?</h2>
              <p className="mt-2 flex items-center gap-2 text-sm opacity-90">
                <ShieldCheck className="h-4 w-4" aria-hidden /> Request an account; you can sign in once it is approved.
              </p>
            </div>
            <Link
              href="/signup"
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-primary-foreground px-6 font-semibold text-primary hover:opacity-90"
            >
              Get started <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
          <div>
            <EasyDineWordmark height={26} />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">Restaurant POS, QR ordering and kitchen display.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground" aria-label="Footer">
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
            <Link href="/signup" className="hover:text-foreground">Create account</Link>
            <Link href="/docs/api" className="hover:text-foreground">API &amp; MCP</Link>
            <Link href="/docs/accessibility" className="hover:text-foreground">Accessibility</Link>
            <Link href="/docs/compliance-india" className="hover:text-foreground">India compliance notes</Link>
          </nav>
        </div>
        <div className="border-t border-border/70">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted-foreground sm:px-6">
            &copy; {new Date().getFullYear()} EasyDine Infotech Private Limited. Licensed AGPL-3.0.
          </p>
        </div>
      </footer>
    </div>
  );
}
