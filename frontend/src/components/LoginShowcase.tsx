import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useId, useState } from "react";

import { PLATFORM_LABELS, PLATFORMS } from "../lib/types";
import { PlatformIcon } from "./PlatformIcon";

// The login page's showcase: one offer, said once, typed out in three languages, flowing to every
// platform and landing as posts. After 21st.dev Typewriter, Animated Beam and Card Stack, on the
// dark stage of motionsites "Aurora Onboard".

const LINES = [
  { lang: "English", text: "20% off filter coffee this weekend ☕" },
  { lang: "ಕನ್ನಡ", text: "ಈ ವಾರಾಂತ್ಯ ಫಿಲ್ಟರ್ ಕಾಫಿ ಮೇಲೆ 20% ರಿಯಾಯಿತಿ ☕" },
  { lang: "हिन्दी", text: "इस वीकेंड फ़िल्टर कॉफ़ी पर 20% छूट ☕" },
];

function graphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (t: string) => Iterable<{ segment: string }> } }).Segmenter;
  return Seg ? [...new Seg(undefined, { granularity: "grapheme" }).segment(text)].map((s) => s.segment) : [...text];
}

/** Types a line, holds it, erases it, moves to the next. Returns the visible text and which line. */
function useTypewriter(lines: string[], reduce: boolean) {
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(reduce ? graphemes(lines[0]).length : 0);
  const [phase, setPhase] = useState<"type" | "hold" | "erase">(reduce ? "hold" : "type");
  const chars = graphemes(lines[index]);
  useEffect(() => {
    if (reduce) return;
    let t: number;
    if (phase === "type") {
      t = window.setTimeout(() => (count < chars.length ? setCount(count + 1) : setPhase("hold")), 55);
    } else if (phase === "hold") {
      t = window.setTimeout(() => setPhase("erase"), 2200);
    } else {
      t = window.setTimeout(() => {
        if (count > 0) setCount(count - 1);
        else { setIndex((index + 1) % lines.length); setPhase("type"); }
      }, 18);
    }
    return () => window.clearTimeout(t);
  }, [count, phase, index, chars.length, lines.length, reduce]);
  return { text: chars.slice(0, count).join(""), index, done: phase === "hold" };
}

const NODES = PLATFORMS.map((p, i) => {
  const angle = (-90 + (360 / PLATFORMS.length) * i) * (Math.PI / 180);
  return { p, x: 50 + Math.cos(angle) * 38, y: 50 + Math.sin(angle) * 38 };
});

export function LoginShowcase() {
  const reduce = Boolean(useReducedMotion());
  const { text, index, done } = useTypewriter(LINES.map((l) => l.text), reduce);
  const line = LINES[index];

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-3xl p-7 xl:p-9" style={{ background: "radial-gradient(120% 90% at 0% 0%, #fed7aa 0%, #fde4ea 48%, #fff7ed 100%)" }}>
      <span aria-hidden="true" className="pointer-events-none absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-[#f9a8d4] opacity-50 blur-[90px]" />
      <span aria-hidden="true" className="pointer-events-none absolute -left-20 bottom-0 h-80 w-80 rounded-full bg-[#fdba74] opacity-50 blur-[90px]" />

      <div className="relative flex items-center gap-2.5">
        <LoopMark className="h-9 w-9" />
        <span className="font-display text-2xl text-[#1c1917]">LOOPLY</span>
      </div>

      {/* 1 · the owner says it */}
      <div className="relative mt-6 flex items-start gap-3" aria-live="polite">
        <span className="relative mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundImage: "linear-gradient(135deg,#ea580c,#ec4899)" }}>
          {!reduce && <span aria-hidden="true" className="lm-pulse-ring absolute inset-0 rounded-full bg-[#f97316]" />}
          <svg aria-hidden="true" viewBox="0 0 24 24" className="relative h-5 w-5 text-[#ffffff]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>
        </span>
        <div className="min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c2410c]">{line.lang}</span>
          <p lang={index === 1 ? "kn" : index === 2 ? "hi" : "en"} className="mt-1 min-h-[3.5rem] rounded-2xl rounded-tl-sm bg-[#ffffff]/80 px-4 py-3 text-lg text-[#1c1917] shadow-sm ring-1 ring-[#f1e3d1] backdrop-blur">
            {text}<span aria-hidden="true" className="ml-0.5 inline-block h-5 w-0.5 translate-y-1 animate-pulse bg-[#ea580c] motion-reduce:animate-none" />
          </p>
        </div>
      </div>

      {/* 2 · it flows to every platform */}
      <div className="relative mx-auto my-4 aspect-square w-full max-w-[13.5rem] shrink">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id="login-beam" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#f97316" /><stop offset="100%" stopColor="#ec4899" /></linearGradient>
          </defs>
          <circle cx="50" cy="50" r="38" fill="none" stroke="#c2410c" strokeOpacity="0.25" strokeDasharray="1 2" />
          {NODES.map((n, i) => (
            <g key={n.p}>
              <line x1="50" y1="50" x2={n.x} y2={n.y} stroke="#c2410c" strokeOpacity="0.18" strokeWidth="0.6" />
              <line x1="50" y1="50" x2={n.x} y2={n.y} stroke="url(#login-beam)" strokeWidth="1.6" strokeLinecap="round" pathLength={1}
                className="lm-flow" style={{ animationDelay: `${i * 0.3}s`, opacity: done ? 1 : 0.35 }} />
            </g>
          ))}
        </svg>
        <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-[#ffffff] shadow-[0_0_40px_rgba(249,115,22,0.35)] ring-1 ring-[#f1e3d1]">
          <LoopMark className="h-10 w-10" bare />
        </span>
        {NODES.map((n) => (
          <span key={n.p} title={PLATFORM_LABELS[n.p]} className="absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl bg-[#ffffff] shadow-lg"
            style={{ left: `${n.x}%`, top: `${n.y}%` }}>
            <PlatformIcon platform={n.p} className="h-5 w-5 text-[#0f1419]" />
          </span>
        ))}
      </div>

      {/* 3 · and lands as posts */}
      <div className="relative grid grid-cols-3 items-stretch gap-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {[
            <div key={`wa-${index}`} className="h-full rounded-2xl bg-[#efeae2] p-2 shadow-xl ring-1 ring-[#e7d8c6]">
              <p className="flex items-center gap-1 text-[10px] font-semibold text-[#128c4b]"><PlatformIcon platform="whatsapp" mono className="h-3 w-3" />WhatsApp</p>
              <p className="mt-1.5 line-clamp-3 rounded-lg rounded-tl-none bg-[#ffffff] px-2 py-1.5 text-[11px] leading-snug text-[#111b21]">{LINES[index].text}</p>
            </div>,
            <div key={`ig-${index}`} className="flex h-full min-h-[6.5rem] flex-col justify-end overflow-hidden rounded-2xl p-2 shadow-xl" style={{ backgroundImage: "linear-gradient(160deg,#7c2d12,#c2410c 55%,#be185d)" }}>
              <p className="font-display text-3xl leading-none text-[#ffffff]">20%</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#fed7aa]">off · {line.lang}</p>
              <p className="mt-1 flex items-center gap-1 text-[10px] text-[#ffffff]/80"><PlatformIcon platform="instagram" mono className="h-3 w-3" />Instagram</p>
            </div>,
            <div key={`fb-${index}`} className="h-full rounded-2xl bg-[#ffffff] p-2 shadow-xl ring-1 ring-[#f1e3d1]">
              <p className="flex items-center gap-1 text-[10px] font-semibold text-[#1877f2]"><PlatformIcon platform="facebook" className="h-3 w-3" />Facebook</p>
              <div className="mt-1.5 h-7 rounded-lg" style={{ backgroundImage: "linear-gradient(135deg,#fdba74,#f9a8d4)" }} />
              <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-[#0f172a]">{LINES[index].text}</p>
            </div>,
          ].map((card, i) => (
            <motion.div key={card.key} className="h-full" initial={reduce ? false : { opacity: 0, y: 16, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }} transition={{ delay: reduce ? 0 : 0.12 * i, type: "spring", bounce: 0.3, duration: 0.6 }}>
              {card}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="relative mt-auto pt-5">
        <p className="font-display text-4xl leading-[1.05] text-[#1c1917]">
          Say it once.<br /><em className="bg-gradient-to-r from-[#c2410c] to-[#db2777] bg-clip-text pr-1 text-transparent">Amplified</em> everywhere.
        </p>
        <p className="mt-3 text-sm text-[#57534e]">One offer → every platform → every language your customers speak.</p>
      </div>
    </div>
  );
}

export function LoopMark({ className = "h-9 w-9", bare = false }: { className?: string; bare?: boolean }) {
  // A unique gradient id per mark: a shared id resolves to the first copy, which may be hidden.
  const gid = `loop-${useId().replace(/:/g, "")}`;
  const svg = (
    <svg viewBox="0 0 64 64" fill="none" className={bare ? className : "h-3/5 w-3/5"} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="8" y1="16" x2="56" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ea580c" /><stop offset="45%" stopColor="#f97316" /><stop offset="75%" stopColor="#ec4899" /><stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <path d="M22 23 C14 23 8 27.5 8 32 C8 36.5 14 41 22 41 C30 41 34 32 42 32 C50 32 56 35 56 32 C56 29 50 23 42 23 C34 23 30 32 22 32"
        stroke={`url(#${gid})`} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (bare) return svg;
  return <span className={`flex items-center justify-center rounded-xl bg-[#ffffff] shadow-sm ring-1 ring-[#f1e3d1] ${className}`}>{svg}</span>;
}
