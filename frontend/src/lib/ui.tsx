import { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>;
}

export function Button({
  children, onClick, type = "button", kind = "primary", disabled = false, small = false,
}: {
  children: ReactNode; onClick?: () => void; type?: "button" | "submit";
  kind?: "primary" | "ghost" | "danger"; disabled?: boolean; small?: boolean;
}) {
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-slate-300",
    ghost: "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
  }[kind];
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`rounded-lg font-medium ${small ? "px-2.5 py-1 text-sm" : "px-4 py-2"} ${styles} disabled:cursor-not-allowed`}>
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

export const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none";

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{(error as Error).message}</p>;
}

export function Spinner() {
  return <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />;
}
