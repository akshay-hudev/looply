import { motion, useReducedMotion } from "framer-motion";
import { ReactNode, useEffect, useState } from "react";

import { AudienceSegment, CoreMessage, PLATFORM_LABELS } from "../lib/types";
import { focusCls } from "../lib/ui";
import { Img, LOOP_GRADIENT, NumberTicker } from "./fx";
import { PlatformIcon } from "./PlatformIcon";

// Sections for a single campaign's tabs, after 21st.dev Insight Cards, Rank Bars, Timeline and
// Selector Chips, rebuilt on the app's own tokens.

/** A titled section card: small caps eyebrow, serif title, optional right-hand slot. */
export function Panel({ eyebrow, title, aside, children, className = "" }: {
  eyebrow?: string; title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`lm-card rounded-3xl border bg-white p-5 sm:p-6 ${className}`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">{eyebrow}</p>}
          <h2 className="font-display text-3xl leading-tight text-slate-900">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function IconTile({ children, className = "h-10 w-10" }: { children: ReactNode; className?: string }) {
  return <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-xl text-[#ffffff] shadow-sm ${className}`} style={{ backgroundImage: LOOP_GRADIENT }}>{children}</span>;
}

export function SparkIcon({ className = "h-5 w-5" }: { className?: string }) {
  return <svg viewBox="0 0 20 20" className={className}><path d="M10 2.5l1.8 4.6 4.7 1.8-4.7 1.8L10 15.5l-1.8-4.8-4.7-1.8 4.7-1.8z" fill="currentColor" /></svg>;
}
export function BulbIcon({ className = "h-5 w-5" }: { className?: string }) {
  return <svg viewBox="0 0 20 20" className={className}><path d="M7.5 14.5h5M8.5 17h3M10 3a5 5 0 0 0-3 9c.6.5 1 1.1 1 1.8v.7h4v-.7c0-.7.4-1.3 1-1.8a5 5 0 0 0-3-9z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export function LockIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 16 16" className={className}><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>;
}
function Tick() {
  return (
    <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
      <svg viewBox="0 0 10 10" className="h-3 w-3"><path d="M1.8 5.2 4 7.3 8.3 2.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}

/** Long text clamped to a few lines, with a toggle to read it all. */
export function ExpandableText({ text, className = "", lines = 4 }: { text: string; className?: string; lines?: number }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 260;
  return (
    <div>
      <p className={className} style={!open && long ? { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" } : undefined}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={`mt-1.5 text-xs font-semibold text-brand-700 ${focusCls}`}>
          {open ? "Show less" : "Read all"}
        </button>
      )}
    </div>
  );
}

/** Why the plan looks the way it does. */
export function WhyNote({ text }: { text: string }) {
  return (
    <div className="lm-glass rounded-2xl p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Why this plan</p>
      <div className="mt-1.5"><ExpandableText text={text} className="text-sm leading-relaxed text-slate-700" /></div>
    </div>
  );
}

/** The campaign's core idea: headline, what it says, why it lands. */
export function BigIdea({ core, why }: { core: CoreMessage; why?: string }) {
  const props = core.value_props ?? [];
  return (
    <section className="lm-card relative overflow-hidden rounded-3xl border bg-white">
      <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundImage: LOOP_GRADIENT }} />
      <div className={`grid gap-8 p-6 sm:p-8 ${why ? "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" : ""}`}>
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-700"><SparkIcon className="h-3.5 w-3.5" />The big idea</p>
          {core.headline && <p className="mt-2 font-display text-4xl leading-[1.05] text-slate-900">“{core.headline}”</p>}
          {core.key_message && <p className="mt-3 text-[15px] leading-relaxed text-slate-700">{core.key_message}</p>}
          {props.length > 0 && (
            <ul className="mt-5 space-y-2.5">
              {props.map((p) => <li key={p} className="flex gap-2.5 text-sm text-slate-800"><Tick />{p}</li>)}
            </ul>
          )}
          {(core.cta_options ?? []).length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="text-xs font-medium text-slate-500">Calls to action:</span>
              {core.cta_options!.map((c) => <span key={c} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">{c}</span>)}
            </div>
          )}
        </div>
        {why && (
          <blockquote className="lm-glass self-start rounded-2xl p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Why this plan</p>
            <div className="mt-2"><ExpandableText text={why} lines={6} className={why.length > 260 ? "text-sm leading-relaxed text-slate-700" : "font-display text-xl italic leading-snug text-slate-800"} /></div>
          </blockquote>
        )}
      </div>
    </section>
  );
}

/** Who the campaign speaks to, primary group first. */
export function AudienceCards({ audiences }: { audiences: AudienceSegment[] }) {
  const sorted = [...audiences].sort((a, b) => Number(b.priority === "primary") - Number(a.priority === "primary"));
  return (
    <div className="grid gap-3">
      {sorted.map((a, i) => {
        const primary = a.priority === "primary";
        return (
          <article key={a.name + i} className={`rounded-2xl border p-4 ${primary ? "border-brand-300 bg-brand-50" : "lm-card bg-white"}`}>
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-xl text-[#ffffff]" style={{ backgroundImage: LOOP_GRADIENT }}>
                {[...a.name.trim()][0]?.toUpperCase() ?? "•"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-xl leading-tight text-slate-900">{a.name}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${primary ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-700"}`}>{primary ? "Main group" : "Also"}</span>
                </div>
                {a.motivation && <div className="mt-1.5"><ExpandableText text={a.motivation} lines={2} className="text-sm text-slate-700" /></div>}
                {a.tone && <p className="mt-1.5 line-clamp-1 text-xs text-slate-600" title={a.tone}><span aria-hidden="true">🗣️ </span>{a.tone}</p>}
                {(a.platforms ?? []).length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {a.platforms!.map((p) => (
                      <span key={p} className="lm-glass inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        <PlatformIcon platform={p} className="h-3.5 w-3.5 text-slate-900" />{PLATFORM_LABELS[p] ?? p}
                      </span>
                    ))}
                    {(a.languages ?? []).length > 0 && <span className="text-[11px] text-slate-600">· {a.languages!.join(", ")}</span>}
                  </div>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function clock(raw: string): { h: number; m: number } | null {
  const t = raw.trim().toLowerCase();
  const hm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) return { h: Number(hm[1]), m: Number(hm[2]) };
  const ap = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!ap) return null;
  let h = Number(ap[1]);
  if (ap[3] === "pm" && h < 12) h += 12;
  if (ap[3] === "am" && h === 12) h = 0;
  return { h, m: Number(ap[2] ?? 0) };
}
function clockLabel(h: number, m: number) {
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

/** The posting schedule laid out on a week, with the reason for each slot. */
export function WeekStrip({ schedule }: { schedule: { platform: string; day: string; time: string; reason: string }[] }) {
  const [focus, setFocus] = useState<number | null>(null);
  const slots = schedule.map((s, i) => {
    // Days can arrive as "Sunday" or "Sunday, October 10".
    const day = DAYS.findIndex((d) => s.day.trim().toLowerCase().startsWith(d.toLowerCase()));
    const t = clock(s.time);
    return { ...s, i, di: day, t, label: t ? clockLabel(t.h, t.m) : s.time };
  });
  const placed = slots.filter((s) => s.di >= 0 && s.t);
  const START = 6, END = 24;
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {DAYS.map((d, di) => {
          // Place pins by time of day, but keep a minimum gap so close slots don't overlap.
          const mine = placed.filter((s) => s.di === di).sort((a, b) => (a.t!.h * 60 + a.t!.m) - (b.t!.h * 60 + b.t!.m));
          const tops: number[] = [];
          for (const s of mine) {
            const raw = Math.min(94, Math.max(6, ((s.t!.h + s.t!.m / 60 - START) / (END - START)) * 100));
            tops.push(tops.length ? Math.max(raw, tops[tops.length - 1] + 13) : raw);
          }
          return (
            <div key={d} className="flex flex-col">
              <p className={`mb-1.5 text-center text-xs font-semibold ${mine.length ? "text-slate-900" : "text-slate-500"}`}>{d.slice(0, 3)}</p>
              <div className={`relative h-52 rounded-xl ${mine.length ? "bg-[#fdf1e4] dark:bg-[#1c1917]" : "bg-[#faf6f0] dark:bg-[#141210]"}`}>
                {mine.map((s, k) => {
                  const top = Math.min(96, tops[k]);
                  const on = focus === s.i;
                  return (
                    <button key={s.i} type="button" onMouseEnter={() => setFocus(s.i)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(s.i)} onBlur={() => setFocus(null)}
                      aria-label={`${PLATFORM_LABELS[s.platform] ?? s.platform}, ${s.day} ${s.label}`}
                      className={`absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full px-1.5 py-0.5 shadow-sm transition-transform ${focusCls} ${on ? "z-10 scale-110 bg-brand-700 text-white" : "lm-glass text-slate-800"}`}
                      style={{ top: `${top}%` }}>
                      <PlatformIcon platform={s.platform} mono={on} className={on ? "h-3.5 w-3.5" : "h-3.5 w-3.5 text-slate-900"} />
                      <span className="text-[10px] font-semibold">{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <ul className="mt-4 space-y-2">
        {slots.map((s) => (
          <li key={s.i} onMouseEnter={() => setFocus(s.i)} onMouseLeave={() => setFocus(null)}
            className={`flex gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${focus === s.i ? "bg-brand-50" : ""}`}>
            <span className="flex w-28 shrink-0 items-center gap-1.5 font-medium text-slate-900">
              <PlatformIcon platform={s.platform} className="h-4 w-4 text-slate-900" />{s.day.slice(0, 3)} {s.label}
            </span>
            <span className={`text-slate-600 ${focus === s.i ? "" : "line-clamp-1"}`} title={s.reason}>{s.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Locked facts as tiles. */
export function FactTiles({ rows }: { rows: { label: string; value: string }[] }) {
  if (!rows.length) return null;
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.label} className="rounded-xl bg-[#fdf1e4] px-3 py-2.5 dark:bg-[#1c1917]">
          <dt className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><LockIcon />{r.label}</dt>
          <dd className="mt-0.5 line-clamp-2 text-sm font-semibold text-slate-900" title={r.value}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Horizontal bars ranked by value; the leader is called out. */
export function RankBars({ items, max = 100, leaderLabel = "Best bet", unit = "" }: {
  items: { id: string; label: string; sub?: string; value: number; thumb?: string | null; platform?: string }[];
  max?: number; leaderLabel?: string; unit?: string;
}) {
  const reduce = useReducedMotion();
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const top = sorted[0]?.value ?? 0;
  return (
    <ol className="space-y-2.5">
      {sorted.map((it, i) => {
        const lead = i === 0 && it.value > 0;
        const pct = Math.max(2, Math.min(100, (it.value / Math.max(max, 1)) * 100));
        return (
          <li key={it.id} className={`flex items-center gap-3 rounded-2xl p-2 pr-3 ${lead ? "bg-brand-50" : ""}`}>
            <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl" style={{ backgroundImage: LOOP_GRADIENT }}>
              <Img src={it.thumb ?? undefined} alt="" className="h-full w-full object-cover"
                fallback={it.platform ? <span className="flex h-full w-full items-center justify-center text-[#ffffff]"><PlatformIcon platform={it.platform} mono className="h-5 w-5" /></span> : null} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium text-slate-900">
                  {it.label}
                  {lead && <span className="ml-2 rounded-full bg-brand-700 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-white">{leaderLabel}</span>}
                </p>
                <span className={`shrink-0 font-display text-2xl leading-none ${lead ? "lm-gradient-text" : "text-slate-900"}`}>{it.value}{unit}</span>
              </div>
              {it.sub && <p className="truncate text-xs text-slate-600">{it.sub}</p>}
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#f1e3d1] dark:bg-[#292524]">
                <motion.div className="h-full rounded-full" style={{ backgroundImage: lead ? "linear-gradient(90deg,#ea580c,#db2777)" : "linear-gradient(90deg,#fdba74,#f9a8d4)" }}
                  initial={{ width: reduce ? `${pct}%` : "0%" }} animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.9, delay: reduce ? 0 : i * 0.06, ease: [0.16, 1, 0.3, 1] }} />
              </div>
            </div>
          </li>
        );
      })}
      {top === 0 && items.length > 0 && <li className="text-xs text-slate-500">No scores yet.</li>}
    </ol>
  );
}

/** Big numbers for platform results; counts up on view. */
export function MetricTiles({ metrics }: { metrics: { label: string; value: number; suffix?: string; hint?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {metrics.map((m, i) => (
        <div key={m.label} className={`rounded-2xl border p-4 ${i === 0 ? "border-brand-300 bg-brand-50" : "lm-card bg-white"}`}>
          <p className="text-xs font-medium text-slate-600">{m.label}</p>
          <p className={`mt-1 font-display text-4xl leading-none ${i === 0 ? "lm-gradient-text" : "text-slate-900"}`}>
            {Number.isInteger(m.value) ? <NumberTicker value={m.value} /> : m.value.toFixed(1)}{m.suffix}
          </p>
          {m.hint && <p className="mt-1 text-[11px] text-slate-500">{m.hint}</p>}
        </div>
      ))}
    </div>
  );
}

/** Two bars per row: what we predicted, and what happened. */
export function PredictedVsActual({ rows }: { rows: { id: string; label: string; platform: string; predicted: number; actual: number; actualLabel: string }[] }) {
  // Plain CSS transition: the bars start at zero and widen just after mounting.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setGrown(true), 60);
    return () => window.clearTimeout(id);
  }, []);
  const peak = Math.max(1, ...rows.map((r) => r.actual));
  const bar = (pct: number) => ({ width: grown ? `${Math.max(0, Math.min(100, pct))}%` : "0%" });
  const barCls = "h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none";
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-full bg-[#fdba74]" />Predicted score (out of 100)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-full" style={{ backgroundImage: "linear-gradient(90deg,#ea580c,#db2777)" }} />Actual reach, compared with your best post</span>
      </div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="grid items-center gap-x-3 gap-y-1 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-900"><PlatformIcon platform={r.platform} className="h-4 w-4 text-slate-900" /><span className="truncate">{r.label}</span></span>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f1e3d1] dark:bg-[#292524]"><div className={`${barCls} bg-[#fdba74]`} style={bar(r.predicted)} /></div>
                <span className="w-16 text-right text-xs tabular-nums text-slate-600">{r.predicted}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f1e3d1] dark:bg-[#292524]"><div className={barCls} style={{ ...bar((r.actual / peak) * 100), backgroundImage: "linear-gradient(90deg,#ea580c,#db2777)" }} /></div>
                <span className="w-16 text-right text-xs font-semibold tabular-nums text-slate-900">{r.actualLabel}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A chat bubble from LOOPLY or from the owner. */
export function Bubble({ from, children }: { from: "ai" | "me"; children: ReactNode }) {
  if (from === "me") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-[#ffffff] shadow-sm" style={{ backgroundImage: "linear-gradient(100deg,#c2410c,#be185d)" }}>{children}</p>
      </div>
    );
  }
  return (
    <div className="flex items-end gap-2">
      <IconTile className="h-8 w-8 rounded-full"><SparkIcon className="h-4 w-4" /></IconTile>
      <p className="lm-glass max-w-[80%] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-slate-900">{children}</p>
    </div>
  );
}

export function TypingDots() {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500 motion-reduce:animate-none" style={{ animationDelay: `${i * 0.15}s` }} />)}
    </span>
  );
}

/** Languages spoken nearby, ranked: the top three stand on a podium, the rest sit beside it. */
export function LanguagePodium({ signals, native }: { signals: { language: string; rank?: number }[]; native: Record<string, string> }) {
  const ranked = [...signals].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  // Podium order: 2nd, 1st, 3rd.
  const order = [top[1], top[0], top[2]].filter(Boolean) as { language: string; rank?: number }[];
  const height: Record<number, string> = { 0: "h-24", 1: "h-16", 2: "h-11" };
  return (
    <div>
      <div className="flex items-end justify-center gap-2" role="list" aria-label="Most spoken languages nearby">
        {order.map((s) => {
          const place = top.indexOf(s);
          return (
            <div key={s.language} role="listitem" className="flex w-24 flex-col items-center gap-1.5">
              <span lang={s.language} className="font-display text-xl leading-none text-slate-900">{native[s.language] ?? s.language}</span>
              <div className={`flex w-full items-start justify-center rounded-t-xl pt-1.5 ${height[place]}`}
                style={{ backgroundImage: place === 0 ? "linear-gradient(180deg,#ea580c,#db2777)" : "linear-gradient(180deg,#fdba74,#f9a8d4)" }}>
                <span className="font-display text-2xl leading-none text-[#ffffff]">{place + 1}</span>
              </div>
            </div>
          );
        })}
      </div>
      {rest.length > 0 && (
        <p className="mt-3 flex flex-wrap justify-center gap-1.5 text-xs text-slate-600">
          {rest.map((s, i) => <span key={s.language} className="lm-glass rounded-full px-2 py-0.5">{i + 4}. {native[s.language] ?? s.language}</span>)}
        </p>
      )}
    </div>
  );
}

/** Donut of post readiness: checked, needs a fix, out of date, still waiting. */
export function ReadinessDonut({ verified, failed, stale, total }: { verified: number; failed: number; stale: number; total: number }) {
  const t = Math.max(total, verified + failed + stale, 1);
  const segs = [
    { n: verified, color: "#059669", label: "Checked" },
    { n: failed, color: "#dc2626", label: "Needs a fix" },
    { n: stale, color: "#d97706", label: "Out of date" },
  ];
  const r = 40;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <div className="relative h-32 w-32 shrink-0">
        <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="12" className="stroke-[#f1e3d1] dark:stroke-[#292524]" />
          {segs.filter((s) => s.n > 0).map((s) => {
            const len = (s.n / t) * circ;
            const el = <circle key={s.label} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth="12" strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset} />;
            offset += len;
            return el;
          })}
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-4xl leading-none text-slate-900">{verified}</span>
          <span className="text-[11px] text-slate-500">of {t} checked</span>
        </span>
      </div>
      <ul className="space-y-1.5 text-sm">
        {segs.map((s) => (
          <li key={s.label} className={`flex items-center gap-2 ${s.n ? "text-slate-800" : "text-slate-400"}`}>
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color, opacity: s.n ? 1 : 0.35 }} />
            <span className="font-display text-xl leading-none">{s.n}</span> {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Written → Approved → Out, with who approved. */
export function ApprovalTrail({ steps }: { steps: { label: string; done: boolean; note?: string }[] }) {
  return (
    <ol className="flex items-start">
      {steps.map((s, i) => (
        <li key={s.label} className="flex flex-1 flex-col items-center text-center">
          <div className="flex w-full items-center">
            <span className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : steps[i].done ? "bg-emerald-500" : "bg-[#f1e3d1] dark:bg-[#292524]"}`} />
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${s.done ? "bg-emerald-600 text-white" : "lm-glass text-slate-500"}`}>
              {s.done ? "✓" : i + 1}
            </span>
            <span className={`h-0.5 flex-1 ${i === steps.length - 1 ? "opacity-0" : steps[i + 1].done ? "bg-emerald-500" : "bg-[#f1e3d1] dark:bg-[#292524]"}`} />
          </div>
          <span className={`mt-1.5 text-xs font-medium ${s.done ? "text-slate-900" : "text-slate-500"}`}>{s.label}</span>
          {s.note && <span className="max-w-[9rem] truncate text-[11px] text-slate-500" title={s.note}>{s.note}</span>}
        </li>
      ))}
    </ol>
  );
}

/** A small ⓘ chip whose explanation shows on hover or focus. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" className={`lm-glass inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-slate-700 ${focusCls}`}>
        <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full bg-sky-600 text-[10px] font-bold text-white">i</span>
        {label}
      </button>
      <span role="tooltip" className="lm-card pointer-events-none absolute left-0 top-full z-30 mt-1.5 w-72 rounded-xl border bg-white p-3 text-xs text-slate-700 opacity-0 shadow-xl transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        {children}
      </span>
    </span>
  );
}
