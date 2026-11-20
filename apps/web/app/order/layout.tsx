// Guest QR ordering always uses the light EasyDine brand (cream, teal,
// charcoal), whatever theme a staff member last picked on this device.
export default function GuestOrderLayout({ children }: { children: React.ReactNode }) {
  return <div className="force-light flex min-h-full flex-1 flex-col bg-background text-foreground [color-scheme:light]">{children}</div>;
}
