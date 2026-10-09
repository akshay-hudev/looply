import { ReactNode, useEffect } from "react";

export const focusCls =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700";
export const fieldCls = `rounded-lg border border-slate-500 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 ${focusCls}`;
export const inputCls = `w-full ${fieldCls}`;
export const selectedCls = "bg-brand-700 text-white";
export const idleCls = "bg-slate-100 text-slate-700 hover:bg-slate-200";

const STATUS_LABELS: Record<string, string> = {
  strategy_review: "Needs a plan",
  clarifying: "Needs an answer",
  generating: "Writing",
  review: "Needs approval",
  approved: "Ready to publish",
  publishing: "Publishing",
  published: "Published",
  pending_localization: "Waiting on translation",
  verified: "Verified",
  failed: "Failed",
  rejected: "Rejected",
  stale: "Out of date",
  scheduled: "Scheduled",
  queued: "Queued",
  simulated: "Simulated",
};

export function statusLabel(status: string): string {
  if (STATUS_LABELS[status]) return STATUS_LABELS[status];
  return status.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DocumentTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = title === "LOOPLY" ? title : `${title} · LOOPLY`;
    return () => { document.title = "LOOPLY"; };
  }, [title]);
  return null;
}

export function Card({ children, className = "", compact = false, id }: { children: ReactNode; className?: string; compact?: boolean; id?: string }) {
  return <div id={id} className={`lm-card rounded-2xl border bg-white ${compact ? "p-3" : "p-4"} ${className}`}>{children}</div>;
}

export function Button({
  children, onClick, type = "button", kind = "primary", disabled = false, small = false, pressed,
}: {
  children: ReactNode; onClick?: () => void; type?: "button" | "submit";
  kind?: "primary" | "ghost" | "danger"; disabled?: boolean; small?: boolean; pressed?: boolean;
}) {
  const styles = {
    primary: "lm-cta bg-brand-700 text-white",
    ghost: "border border-slate-500 bg-white text-slate-700 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
  }[kind];
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-pressed={pressed}
      className={`rounded-xl font-medium disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-600 ${focusCls} ${small ? "px-2.5 py-1 text-sm" : "px-4 py-2"} ${styles}`}>
      {children}
    </button>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "red" | "amber" | "blue" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700", green: "bg-emerald-100 text-emerald-800",
    red: "bg-red-100 text-red-800", amber: "bg-amber-100 text-amber-800", blue: "bg-sky-100 text-sky-800",
  }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones}`}>{children}</span>;
}

export function statusTone(status: string): "slate" | "green" | "red" | "amber" | "blue" {
  if (["verified", "approved", "published"].includes(status)) return "green";
  if (["failed", "rejected"].includes(status)) return "red";
  if (["stale", "pending_localization", "scheduled"].includes(status)) return "amber";
  if (["generating", "publishing", "review", "strategy_review"].includes(status)) return "blue";
  return "slate";
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{(error as Error).message}</p>;
}

export function Spinner() {
  return <span aria-hidden="true" className="inline-block h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-brand-700 border-t-transparent motion-reduce:animate-none" />;
}

export function Stepper({ steps, step, onJump, spread = false }: { steps: string[]; step: number; onJump?: (i: number) => void; spread?: boolean }) {
  return (
    <ol className={spread ? "grid grid-cols-2 gap-2 sm:grid-cols-4" : "flex flex-wrap gap-2 text-xs"}>
      {steps.map((label, i) => {
        const cls = i === step ? selectedCls : i < step ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-600";
        const body = <><span className="font-semibold">{i < step ? "✓" : i + 1}</span>{label}</>;
        const shape = spread
          ? "flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm"
          : "flex items-center gap-1.5 rounded-full px-3 py-1";
        return (
          <li key={label} className={spread ? "min-w-0" : undefined}>
            {onJump ? (
              <button type="button" onClick={() => onJump(i)} className={`${shape} ${focusCls} ${cls}`}>{body}</button>
            ) : (
              <span className={`${shape} ${cls}`}>{body}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
