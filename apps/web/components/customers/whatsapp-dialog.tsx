"use client";

import {
  DEFAULT_WHATSAPP_TEMPLATES,
  renderWhatsappTemplate,
  type WhatsappTemplates,
} from "@easydine/types";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Customer } from "@/hooks/use-customers";
import { openExternal, whatsappDigits, whatsappUrl } from "@/lib/outbound";

type TemplateKey = keyof typeof DEFAULT_WHATSAPP_TEMPLATES;
const LABELS: Record<TemplateKey, string> = {
  greeting: "Greeting",
  offer: "New offer",
  points: "Loyalty points update",
};

/** The restaurant's own template when set, else the built-in one. */
export function templateText(templates: WhatsappTemplates | null | undefined, key: TemplateKey): string {
  return templates?.[key]?.trim() || DEFAULT_WHATSAPP_TEMPLATES[key];
}

/** Whether this customer can be messaged at all (needs a usable phone). */
export function canWhatsapp(customer: Pick<Customer, "phone">): boolean {
  return whatsappDigits(customer.phone) !== null;
}

// Opens wa.me from the restaurant's own WhatsApp: no API, nothing is sent from
// our servers. The message is editable first, and a confirmation shows that
// WhatsApp was opened.
export function WhatsappDialog({
  customer,
  templates,
  loyaltyEnabled,
  onClose,
}: {
  customer: Customer;
  templates: WhatsappTemplates | null | undefined;
  loyaltyEnabled: boolean;
  onClose: () => void;
}) {
  const keys = (Object.keys(LABELS) as TemplateKey[]).filter((k) => loyaltyEnabled || k !== "points");
  const render = (k: TemplateKey) =>
    renderWhatsappTemplate(templateText(templates, k), {
      name: customer.name,
      points: customer.loyaltyPoints,
    });
  const [active, setActive] = useState<TemplateKey>("greeting");
  const [message, setMessage] = useState(() => render("greeting"));
  const [opened, setOpened] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = useMemo(() => whatsappUrl(customer.phone, message), [customer.phone, message]);

  useEffect(() => {
    if (!opened) return;
    const t = setTimeout(() => setOpened(false), 6000);
    return () => clearTimeout(t);
  }, [opened]);

  const send = () => {
    if (!message.trim() || !url) return;
    if (openExternal(url)) {
      setFailed(false);
      setOpened(true);
    } else setFailed(true);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="whatsapp-dialog">
        <DialogHeader>
          <DialogTitle>WhatsApp {customer.name ?? customer.phone}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Opens WhatsApp with this message ready to send from your own number to {customer.phone}.
          </p>
          <div className="flex flex-wrap gap-2">
            {keys.map((k) => (
              <Button
                key={k}
                type="button"
                size="sm"
                variant={active === k ? "default" : "outline"}
                onClick={() => {
                  setActive(k);
                  setMessage(render(k));
                }}
              >
                {LABELS[k]}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="wa-message">Message</Label>
            <Textarea
              id="wa-message"
              rows={5}
              maxLength={1000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          {customer.marketingOptOut && (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
              This customer opted out of marketing messages. Only send them something they asked for.
            </p>
          )}
          {opened && (
            <p role="status" data-testid="whatsapp-confirmation" className="flex items-center gap-1.5 text-sm font-medium text-success">
              <CheckCircle2 className="h-4 w-4" />
              Opening WhatsApp…
            </p>
          )}
          {failed && (
            <p role="alert" className="text-sm text-destructive">
              Couldn&apos;t open WhatsApp. Check the phone number and try again.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={send} disabled={!message.trim() || !url} data-testid="whatsapp-send">
            <MessageCircle className="mr-1.5 h-4 w-4" />
            Send on WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
