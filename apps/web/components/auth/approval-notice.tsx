import { Clock, XCircle } from "lucide-react";
import Link from "next/link";

/** Shown instead of the app while a restaurant account is not approved. */
export function ApprovalNotice({ status, restaurantName }: { status: "pending" | "rejected"; restaurantName?: string }) {
  const pending = status === "pending";
  return (
    <div
      role="status"
      className={
        pending
          ? "flex flex-col items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-6 text-center"
          : "flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center"
      }
    >
      {pending ? <Clock className="h-8 w-8 text-warning" aria-hidden /> : <XCircle className="h-8 w-8 text-destructive" aria-hidden />}
      <h2 className="text-lg font-semibold text-foreground">
        {pending ? "Waiting for approval" : "Account not approved"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {pending
          ? `Thanks for signing up${restaurantName ? ` ${restaurantName}` : ""}. Your restaurant account is being reviewed. You can sign in as soon as it is approved.`
          : "This restaurant account was not approved. If you think this is a mistake, contact EasyDine support."}
      </p>
      <Link href="/" className="text-sm font-medium text-primary hover:underline">
        Back to the home page
      </Link>
    </div>
  );
}

/** The login / API error code for an account that is not approved, if it is one. */
export function approvalStateFromError(err: unknown): "pending" | "rejected" | null {
  const code = (err as { code?: string } | null)?.code;
  if (code === "ACCOUNT_PENDING") return "pending";
  if (code === "ACCOUNT_REJECTED") return "rejected";
  return null;
}
