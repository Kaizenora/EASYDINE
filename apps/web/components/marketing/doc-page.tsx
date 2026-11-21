import type { ReactNode } from "react";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";

export function DocPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="force-light flex min-h-full flex-col bg-background text-foreground">
      <MarketingNav home={false} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-36 pb-20 sm:px-6">
        <h1 className="ed-enter font-heading text-[40px] leading-tight font-light tracking-[-0.02em] text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
        <div className="mt-10 flex flex-col gap-10">{children}</div>
      </main>
      <MarketingFooter />
    </div>
  );
}

export function DocSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-heading text-[22px] font-normal tracking-[-0.01em] text-foreground">{heading}</h2>
      <div className="mt-3 flex flex-col gap-3 text-[15px] leading-relaxed font-light text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export function DocList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="ml-5 flex list-disc flex-col gap-1.5">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}
