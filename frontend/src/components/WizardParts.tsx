import { motion, useReducedMotion } from "framer-motion";
import { ReactNode, useState } from "react";

import { LANGUAGES, PLATFORM_LABELS } from "../lib/types";
import { focusCls } from "../lib/ui";
import { NATIVE_LANGUAGE } from "./AmplifyBeams";
import { LOOP_GRADIENT } from "./fx";
import { PlatformIcon } from "./PlatformIcon";

// Pieces for the new-campaign wizard, after 21st.dev Wizard Steps, Choicebox, Icon Card Radio Group,
// Preview Card, Welcome Checklist and Ticket Confirmation Card, rebuilt on the app's tokens.

/** The steps as icon stops on a gradient line. Past steps are clickable. */
export function WizardRail({ steps, step, onJump }: { steps: { label: string; icon: string }[]; step: number; onJump: (i: number) => void }) {
  const reduce = useReducedMotion();
  return (
    <nav aria-label="Campaign steps" className="lm-card rounded-3xl border bg-white px-3 py-4 sm:px-6">
      <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        <span aria-hidden="true" className="absolute top-5 h-1 -translate-y-1/2 rounded-full bg-[#f1e3d1] dark:bg-[#292524]"
          style={{ left: `${50 / steps.length}%`, right: `${50 / steps.length}%` }}>
          <motion.span className="block h-full rounded-full" style={{ backgroundImage: "linear-gradient(90deg,#059669,#f97316,#db2777)" }}
            initial={false} animate={{ width: `${(step / Math.max(steps.length - 1, 1)) * 100}%` }}
            transition={reduce ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
        </span>
        {steps.map((s, i) => {
          const done = i < step;
          const on = i === step;
          return (
            <li key={s.label} className="relative flex justify-center">
              <button type="button" disabled={i >= step} onClick={() => onJump(i)} aria-current={on ? "step" : undefined}
                className={`flex flex-col items-center gap-1.5 rounded-xl px-1 disabled:cursor-default ${focusCls}`}>
                <span className={`relative flex h-10 w-10 items-center justify-center rounded-full text-lg ${done ? "bg-emerald-600 text-white" : on ? "lm-cta text-white" : "lm-glass"}`}>
                  {on && !reduce && <span aria-hidden="true" className="lm-pulse-ring absolute inset-0 rounded-full bg-brand-500" />}
                  <span className="relative">{done ? "✓" : <span aria-hidden="true">{s.icon}</span>}</span>
                </span>
                <span className={`text-xs sm:text-sm ${on ? "font-semibold text-slate-900" : done ? "text-emerald-800" : "text-slate-500"}`}>{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** A big selectable card: icon, title, one short line. */
export function ChoiceCard({ icon, title, line, on, onClick, children }: {
  icon: ReactNode; title: string; line?: string; on: boolean; onClick: () => void; children?: ReactNode;
}) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition duration-200 motion-reduce:transition-none ${focusCls} ${
        on ? "border-brand-600 bg-brand-50 shadow-md" : "border-[#f1e3d1] bg-white hover:-translate-y-0.5 hover:border-brand-300 dark:border-[#292524]"}`}>
      <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${on ? "text-[#ffffff]" : "bg-[#fdf1e4] dark:bg-[#1c1917]"}`}
        style={on ? { backgroundImage: LOOP_GRADIENT } : undefined}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-xl leading-tight text-slate-900">{title}</span>
        {line && <span className="mt-0.5 block text-xs text-slate-600">{line}</span>}
        {children}
      </span>
    </button>
  );
}

function splitList(value?: string) {
  return (value || "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Suggestion chips: the first few show, the rest sit behind "+ more". Picks join as a comma list. */
export function ChipPicker({ options, value, onPick, initial = 6, label }: {
  options: string[]; value?: string; onPick: (v: string) => void; initial?: number; label: string;
}) {
  const [all, setAll] = useState(false);
  const selected = splitList(value);
  const shown = all ? options : options.slice(0, initial);
  const hiddenPicked = !all ? options.slice(initial).filter((o) => selected.includes(o)) : [];
  const toggle = (o: string) => onPick((selected.includes(o) ? selected.filter((s) => s !== o) : [...selected, o]).join(", "));
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {[...shown, ...hiddenPicked].map((o) => {
        const on = selected.includes(o);
        return (
          <button key={o} type="button" aria-pressed={on} onClick={() => toggle(o)}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${focusCls} ${on ? "lm-cta font-semibold text-white" : "lm-glass text-slate-700 hover:text-slate-900"}`}>
            {on ? "✓ " : "+ "}{o}
          </button>
        );
      })}
      {options.length > initial && (
        <button type="button" onClick={() => setAll(!all)} aria-expanded={all}
          className={`rounded-full px-3 py-1 text-xs font-semibold text-brand-700 ${focusCls}`}>
          {all ? "Fewer" : `+ ${options.length - initial} more`}
        </button>
      )}
    </div>
  );
}

/** Multi-pick icon tiles, stored as the same comma list the text field uses. */
export function IconTiles({ options, value, onPick, label, columns = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" }: {
  options: { label: string; icon: string }[]; value?: string; onPick: (v: string) => void; label: string; columns?: string;
}) {
  const selected = splitList(value);
  const toggle = (o: string) => onPick((selected.includes(o) ? selected.filter((s) => s !== o) : [...selected, o]).join(", "));
  return (
    <div role="group" aria-label={label} className={`grid gap-2 ${columns}`}>
      {options.map((o) => {
        const on = selected.includes(o.label);
        return (
          <button key={o.label} type="button" aria-pressed={on} onClick={() => toggle(o.label)}
            className={`flex items-center gap-2.5 rounded-2xl border-2 px-3 py-2.5 text-left text-sm transition duration-200 motion-reduce:transition-none ${focusCls} ${
              on ? "border-brand-600 bg-brand-50 font-semibold text-slate-900" : "border-[#f1e3d1] bg-white text-slate-700 hover:-translate-y-0.5 hover:border-brand-300 dark:border-[#292524]"}`}>
            <span aria-hidden="true" className="text-xl">{o.icon}</span>
            <span className="leading-tight">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** One card per platform: a switch to include it, and its formats once it's on. */
export function PlatformCards({ platforms, catalog, formatLabels, formats, onChange }: {
  platforms: string[]; catalog: Record<string, string[]>; formatLabels: Record<string, string>;
  formats: Record<string, string[]>; onChange: (next: Record<string, string[]>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {platforms.map((p) => {
        const list = formats[p] ?? [];
        const on = list.length > 0;
        const name = PLATFORM_LABELS[p] ?? p;
        return (
          <div key={p} className={`rounded-2xl border-2 p-3 transition-colors ${on ? "border-brand-600 bg-brand-50" : "border-[#f1e3d1] bg-white dark:border-[#292524]"}`}>
            <button type="button" role="switch" aria-checked={on} aria-label={`Post on ${name}`}
              onClick={() => onChange({ ...formats, [p]: on ? [] : [catalog[p][0]] })}
              className={`flex w-full items-center gap-2.5 rounded-xl ${focusCls}`}>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm"><PlatformIcon platform={p} className="h-5 w-5 text-slate-900" /></span>
              <span className="flex-1 text-left font-medium text-slate-900">{name}</span>
              <span aria-hidden="true" className={`relative h-6 w-10 rounded-full transition-colors ${on ? "bg-brand-700" : "bg-[#e7d8c6] dark:bg-[#292524]"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.1rem]" : "left-0.5"}`} />
              </span>
            </button>
            {on && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {catalog[p].map((f) => {
                  const picked = list.includes(f);
                  return (
                    <button key={f} type="button" aria-pressed={picked}
                      onClick={() => onChange({ ...formats, [p]: picked ? list.filter((x) => x !== f) : [...list, f] })}
                      className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${focusCls} ${picked ? "bg-brand-700 font-semibold text-white" : "bg-white text-slate-700 ring-1 ring-[#e7d8c6] dark:bg-[#1c1917] dark:ring-[#292524]"}`}>
                      {formatLabels[f] ?? f}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Language chips with the regional ones first and the rest behind "+ more". */
export function LanguagePicker({ value, onChange, first = ["en", "kn", "hi", "ta", "te", "ml", "mr", "bn"] }: {
  value: string[]; onChange: (v: string[]) => void; first?: string[];
}) {
  const [all, setAll] = useState(false);
  const codes = Object.keys(LANGUAGES);
  const ordered = [...first.filter((c) => codes.includes(c)), ...codes.filter((c) => !first.includes(c))];
  const shown = all ? ordered : [...ordered.slice(0, first.length), ...ordered.slice(first.length).filter((c) => value.includes(c))];
  return (
    <div role="group" aria-label="Languages" className="flex flex-wrap gap-2">
      {shown.map((code) => {
        const on = value.includes(code);
        const native = NATIVE_LANGUAGE[code];
        const english = (LANGUAGES[code] ?? code).replace(/\s*\(.*\)$/, "");
        return (
          <button key={code} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((l) => l !== code) : [...value, code])}
            className={`rounded-xl px-3 py-1.5 text-sm transition-colors ${focusCls} ${on ? "lm-cta text-white" : "lm-glass text-slate-700 hover:text-slate-900"}`}>
            <span className="font-medium">{native && native !== english ? native : english}</span>
            {native && native !== english && <span className={`ml-1.5 text-xs ${on ? "text-white/80" : "text-slate-500"}`}>{english}</span>}
          </button>
        );
      })}
      <button type="button" onClick={() => setAll(!all)} aria-expanded={all} className={`rounded-xl px-3 py-1.5 text-sm font-semibold text-brand-700 ${focusCls}`}>
        {all ? "Fewer" : `+ ${ordered.length - first.length} more`}
      </button>
    </div>
  );
}

/** The two ways to write regional languages, each shown as a sample chat bubble. */
export function StyleCards({ mixed, onChange }: { mixed: boolean; onChange: (mixed: boolean) => void }) {
  const card = (on: boolean, title: string, sample: string, onClick: () => void) => (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`rounded-2xl border-2 p-3 text-left transition-colors ${focusCls} ${on ? "border-brand-600 bg-brand-50" : "border-[#f1e3d1] bg-white hover:border-brand-300 dark:border-[#292524]"}`}>
      <span className="block font-display text-xl text-slate-900">{title}</span>
      <span className="mt-2 inline-block max-w-full rounded-2xl rounded-bl-sm bg-[#ffffff] px-3 py-1.5 text-sm text-[#111b21] shadow-sm ring-1 ring-[#e7d8c6] dark:bg-[#202c33] dark:text-[#e9edef] dark:ring-0">{sample}</span>
    </button>
  );
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {card(mixed, "Everyday mix", "Weekend alli best coffee ide! ☕", () => onChange(true))}
      {card(!mixed, "Pure script", "ವಾರಾಂತ್ಯದಲ್ಲಿ ಅತ್ಯುತ್ತಮ ಕಾಫಿ ☕", () => onChange(false))}
    </div>
  );
}

/** Completeness as a small ring. */
export function DetailRing({ filled, total }: { filled: number; total: number }) {
  const r = 16;
  const circ = 2 * Math.PI * r;
  const pct = total ? filled / total : 0;
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 40 40" className="h-9 w-9 -rotate-90" aria-hidden="true">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="5" className="stroke-[#f1e3d1] dark:stroke-[#292524]" />
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="5" stroke="#059669" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} className="transition-[stroke-dashoffset] duration-500" />
      </svg>
      <span className="text-xs text-slate-600"><b className="font-display text-xl text-slate-900">{filled}</b> of {total} details</span>
    </span>
  );
}

/** The poster the owner is building, filling in as they type. Empty parts are dashed placeholders. */
export function LivePoster({ shop, product, offer, when, audience, special, platforms, aiPicks, languages, filled, total }: {
  shop: string; product?: string; offer?: string; when?: string; audience?: string; special?: string;
  platforms: string[]; aiPicks: boolean; languages: string[]; filled: number; total: number;
}) {
  const reduce = useReducedMotion();
  const ghost = "rounded-lg border-2 border-dashed border-[#ffffff]/40 px-2 py-0.5 text-[#ffffff]/60";
  return (
    <aside aria-label="Live preview" className="lm-card space-y-4 rounded-3xl border bg-white p-4 lg:sticky lg:top-24">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">Live preview</p>
        <DetailRing filled={filled} total={total} />
      </div>
      <div className="relative overflow-hidden rounded-2xl p-5 text-center text-[#ffffff] shadow-lg" style={{ backgroundImage: "linear-gradient(150deg,#7c2d12,#c2410c 45%,#be185d)" }}>
        <span aria-hidden="true" className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#ffffff]/10" />
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#fed7aa]">{shop || "Your shop"}</p>
        <motion.p key={offer || "none"} initial={reduce ? false : { scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className={`mt-3 font-display leading-none ${!offer || offer.length <= 9 ? "text-5xl" : offer.length <= 16 ? "text-4xl" : "text-3xl"}`}>
          {offer ? offer : <span className={`${ghost} text-2xl`}>your offer</span>}
        </motion.p>
        <p className="mt-2 text-sm font-semibold">{product || <span className={ghost}>what you're promoting</span>}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-1.5 text-[11px]">
          <span className={when ? "rounded-full bg-[#ffffff]/20 px-2 py-0.5" : ghost}>📅 {when || "when"}</span>
          <span className={audience ? "max-w-[10rem] truncate rounded-full bg-[#ffffff]/20 px-2 py-0.5" : ghost} title={audience}>👥 {audience || "for whom"}</span>
          {special && <span className="max-w-[10rem] truncate rounded-full bg-[#ffffff]/20 px-2 py-0.5" title={special}>✨ {special}</span>}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          {aiPicks
            ? <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">✨ AI picks platforms</span>
            : platforms.length
              ? platforms.map((p) => <span key={p} title={PLATFORM_LABELS[p] ?? p}><PlatformIcon platform={p} className="h-5 w-5 text-slate-900" /></span>)
              : <span className="text-xs text-slate-500">No platforms yet</span>}
        </span>
        <span className="flex flex-wrap gap-1">
          {languages.map((l) => <span key={l} className="lm-glass rounded-full px-2 py-0.5 text-xs text-slate-700">{NATIVE_LANGUAGE[l] ?? (LANGUAGES[l] ?? l).replace(/\s*\(.*\)$/, "")}</span>)}
        </span>
      </div>
    </aside>
  );
}

/** Ticket-style summary of what is about to be made. */
export function Ticket({ shop, offer, product, chips, platforms, languages, formatCount, aiPicks, footer }: {
  shop: string; offer: string; product: string; chips: { icon: string; label: string; value?: string }[];
  platforms: string[]; languages: string[]; formatCount: number; aiPicks: boolean; footer: ReactNode;
}) {
  const posts = formatCount * Math.max(languages.length, 1);
  return (
    <div className="lm-card overflow-hidden rounded-3xl border bg-white">
      <div className="grid gap-6 p-6 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">{shop}</p>
          <p className={`mt-1 lm-gradient-text font-display leading-none ${offer.length <= 16 ? "text-5xl" : "text-4xl"}`}>{offer}</p>
          <p className="mt-2 font-display text-2xl text-slate-900">{product}</p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {chips.filter((c) => c.value).map((c) => (
              <span key={c.label} className="lm-glass inline-flex max-w-[18rem] items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-slate-800" title={`${c.label}: ${c.value}`}>
                <span aria-hidden="true">{c.icon}</span><span className="truncate">{c.value}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center rounded-2xl bg-[#fdf1e4] px-5 py-4 text-center dark:bg-[#1c1917]">
          {aiPicks ? (
            <>
              <span aria-hidden="true" className="text-3xl">✨</span>
              <p className="mt-1 text-sm font-semibold text-slate-900">AI picks the mix</p>
              <p className="text-xs text-slate-600">in {languages.length} {languages.length === 1 ? "language" : "languages"}</p>
            </>
          ) : (
            <>
              <p className="font-display text-5xl leading-none text-slate-900">≈{posts}</p>
              <p className="text-xs text-slate-600">posts</p>
              <p className="mt-2 text-xs text-slate-700">{formatCount} {formatCount === 1 ? "format" : "formats"} × {languages.length} {languages.length === 1 ? "language" : "languages"}</p>
              <div className="mt-2 flex gap-1">{platforms.map((p) => <PlatformIcon key={p} platform={p} className="h-4 w-4 text-slate-900" />)}</div>
            </>
          )}
        </div>
      </div>
      <div aria-hidden="true" className="relative h-0 border-t-2 border-dashed border-[#f1e3d1] dark:border-[#292524]">
        <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-[#fff8ef] dark:bg-[#0c0a09]" />
        <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-[#fff8ef] dark:bg-[#0c0a09]" />
      </div>
      <div className="p-5">{footer}</div>
    </div>
  );
}
