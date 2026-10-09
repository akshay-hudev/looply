import { motion, useReducedMotion } from "framer-motion";

import { LANGUAGES, PLATFORM_LABELS, PLATFORMS } from "../lib/types";
import { PlatformIcon } from "./PlatformIcon";

// "Your intent, amplified": one offer in the middle, light flowing out to every platform it
// goes to. After 21st.dev "Animated Beam" (Magic UI) — rebuilt as one SVG in a fixed-aspect box
// so the beams and the HTML nodes share a coordinate system without measuring the DOM.

const NATIVE: Record<string, string> = {
  en: "English", hi: "हिन्दी", kn: "ಕನ್ನಡ", ta: "தமிழ்", te: "తెలుగు", mr: "मराठी", bn: "বাংলা",
  ml: "മലയാളം", gu: "ગુજરાતી", pa: "ਪੰਜਾਬੀ", ur: "اردو", es: "Español", fr: "Français", ar: "العربية", pt: "Português", id: "Bahasa",
};

// viewBox is 160 × 100; nodes sit in two columns either side of the centre card.
const SLOTS = [
  { x: 14, y: 16 }, { x: 8, y: 50 }, { x: 14, y: 84 },
  { x: 146, y: 16 }, { x: 152, y: 50 }, { x: 146, y: 84 },
];

function pathFor(slot: { x: number; y: number }) {
  const left = slot.x < 80;
  const sx = left ? 58 : 102;
  const mid = (sx + slot.x) / 2;
  return `M ${sx} 50 C ${mid} 50, ${mid} ${slot.y}, ${slot.x} ${slot.y}`;
}

export function AmplifyBeams({ figure, caption, platforms, languages, eyebrow = "Your offer" }: {
  figure: string;
  caption?: string;
  platforms: string[];
  languages: string[];
  eyebrow?: string;
}) {
  const reduce = useReducedMotion();
  const live = new Set(platforms);
  const nodes = [...PLATFORMS];
  const langs = languages.length ? languages : ["en"];
  const big = figure.length <= 10;

  return (
    <figure className="w-full">
      <div className="relative aspect-[16/10] w-full">
        <svg viewBox="0 0 160 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id="amp-beam" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
          {nodes.map((p, i) => {
            const d = pathFor(SLOTS[i]);
            const on = live.has(p);
            return (
              <g key={p}>
                <path d={d} fill="none" stroke={on ? "#fdba74" : "#e7d8c6"} strokeWidth={on ? 2 : 1.5} strokeDasharray={on ? undefined : "3 4"}
                  vectorEffect="non-scaling-stroke" className="dark:opacity-40" />
                {on && (
                  <path d={d} fill="none" stroke="url(#amp-beam)" strokeWidth={3.5} strokeLinecap="round" pathLength={1}
                    vectorEffect="non-scaling-stroke" className="lm-flow" style={{ animationDelay: `${i * 0.35}s` }} />
                )}
              </g>
            );
          })}
        </svg>

        {nodes.map((p, i) => {
          const slot = SLOTS[i];
          const on = live.has(p);
          return (
            // Position on a plain wrapper: framer-motion owns `transform` on the animated child.
            <div key={p} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${(slot.x / 160) * 100}%`, top: `${slot.y}%` }}>
            <motion.div
              initial={reduce ? false : { opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 + i * 0.07, type: "spring", bounce: 0.35, duration: 0.5 }}>
              <span title={`${PLATFORM_LABELS[p] ?? p}${on ? "" : " (not in this campaign)"}`}
                className={`lm-glass relative flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm ${on ? "" : "opacity-45 grayscale"}`}>
                {on && !reduce && <span aria-hidden="true" className="lm-pulse-ring absolute inset-0 rounded-2xl border-2 border-brand-300" style={{ animationDelay: `${i * 0.3}s` }} />}
                <PlatformIcon platform={p} className="h-6 w-6 text-slate-900" />
              </span>
            </motion.div>
            </div>
          );
        })}

        <div className="absolute left-1/2 top-1/2 w-[38%] -translate-x-1/2 -translate-y-1/2">
        <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="lm-beam rounded-2xl shadow-lg">
            <div className="rounded-[calc(1rem-2px)] bg-white px-3 py-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-700">{eyebrow}</p>
              <p className={`lm-gradient-text font-display leading-none ${big ? "mt-1 text-4xl" : "mt-1.5 text-xl"}`}>{figure}</p>
              {caption && <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-slate-600">{caption}</p>}
            </div>
          </div>
        </motion.div>
        </div>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        <span className="sr-only">Goes out on {platforms.map((p) => PLATFORM_LABELS[p] ?? p).join(", ") || "no platforms yet"}, in</span>
        {langs.map((l) => (
          <span key={l} className="lm-glass rounded-full px-2.5 py-0.5 text-xs font-medium text-slate-700" title={LANGUAGES[l] ?? l}>
            {NATIVE[l] ?? LANGUAGES[l] ?? l}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export { NATIVE as NATIVE_LANGUAGE };
