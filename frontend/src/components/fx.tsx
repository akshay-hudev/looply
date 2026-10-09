import { animate, motion, useReducedMotion } from "framer-motion";
import { ImgHTMLAttributes, ReactNode, useEffect, useRef, useState } from "react";

import { focusCls } from "../lib/ui";

// Decorative pieces for the warm festive look. Each is modelled on a 21st.dev component
// (Aurora Background, Border Beam, Number Ticker, Animated Tabs, Card Stack, Confetti) and
// rebuilt on Tailwind + framer-motion so it follows this app's tokens, dark mode and
// reduced-motion rules.

export const LOOP_GRADIENT = "linear-gradient(135deg, #ea580c 0%, #f97316 40%, #ec4899 75%, #06b6d4 100%)";

/** Soft blurred colour blobs drifting behind a banner. Place inside a `relative overflow-hidden` box. */
export function Aurora({ tone = "warm" }: { tone?: "warm" | "quiet" }) {
  const blobs = tone === "warm"
    ? [
      { c: "#fdba74", s: "w-[55%] h-[90%] -left-[10%] -top-[30%]", d: "0s" },
      { c: "#f9a8d4", s: "w-[45%] h-[80%] right-[5%] -top-[20%]", d: "-6s" },
      { c: "#fde68a", s: "w-[40%] h-[70%] left-[30%] top-[40%]", d: "-11s" },
      { c: "#a5f3fc", s: "w-[22%] h-[45%] right-[-4%] bottom-[-12%]", d: "-3s" },
    ]
    : [
      { c: "#fed7aa", s: "w-[50%] h-[90%] -left-[10%] -top-[40%]", d: "0s" },
      { c: "#fbcfe8", s: "w-[40%] h-[80%] right-[0%] -top-[30%]", d: "-8s" },
    ];
  return (
    <div aria-hidden="true" className="lm-aurora">
      {blobs.map((b, i) => <span key={i} className={b.s} style={{ backgroundColor: b.c, animationDelay: b.d }} />)}
    </div>
  );
}

/** A comet of light running around the border, for the one card that needs the owner. */
export function BorderBeam({ children, className = "", active = true, radius = "rounded-2xl" }: {
  children: ReactNode; className?: string; active?: boolean; radius?: string;
}) {
  if (!active) return <div className={className}>{children}</div>;
  return (
    <div className={`lm-beam ${radius} ${className}`}>
      <div className={`h-full ${radius === "rounded-3xl" ? "rounded-[calc(1.5rem-2px)]" : "rounded-[calc(1rem-2px)]"} bg-white`}>{children}</div>
    </div>
  );
}

/** Counts up to `value` when it appears. */
export function NumberTicker({ value, className = "" }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) { el.textContent = String(value); return; }
    const controls = animate(0, value, {
      duration: 1.1, ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { el.textContent = String(Math.round(v)); },
    });
    return () => controls.stop();
  }, [value, reduce]);
  return <span ref={ref} className={`tabular-nums ${className}`}>{reduce ? value : 0}</span>;
}

/** Tabs whose highlight pill slides to the chosen tab. */
export function SlidingTabs<T extends string>({ items, value, onChange, label, id }: {
  items: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; id: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div role="tablist" aria-label={label} className="lm-glass inline-flex max-w-full flex-wrap gap-1 rounded-2xl p-1 text-sm">
      {items.map((t) => {
        const on = t.id === value;
        return (
          <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => onChange(t.id)}
            className={`relative rounded-xl px-3.5 py-1.5 transition-colors ${focusCls} ${on ? "font-semibold text-white" : "text-slate-700 hover:text-slate-900"}`}>
            {on && (
              <motion.span layoutId={`${id}-pill`} className="absolute inset-0 rounded-xl" style={{ backgroundImage: "linear-gradient(100deg, #c2410c, #be185d)" }}
                transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.18, duration: 0.45 }} />
            )}
            <span className="relative">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A score from 0–100 drawn as a ring that fills when it appears. */
export function ScoreRing({ value, label, max = 100, display }: { value: number | null | undefined; label: string; max?: number; display?: string }) {
  const reduce = useReducedMotion();
  const has = typeof value === "number" && !Number.isNaN(value);
  const pct = has ? Math.max(0, Math.min(1, value! / max)) : 0;
  const r = 34;
  const circ = 2 * Math.PI * r;
  return (
    <div className="lm-card flex flex-col items-center gap-2 rounded-2xl border bg-white p-4 text-center">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90" aria-hidden="true">
          <defs>
            <linearGradient id={`ring-${label.replace(/\W/g, "")}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ea580c" /><stop offset="100%" stopColor="#db2777" />
            </linearGradient>
          </defs>
          <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeWidth="7" className="text-[#f5ebdf] dark:text-[#292524]" />
          <motion.circle cx="40" cy="40" r={r} fill="none" stroke={`url(#ring-${label.replace(/\W/g, "")})`} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={circ} initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ * (1 - pct) }}
            transition={reduce ? { duration: 0 } : { duration: 1.1, ease: [0.16, 1, 0.3, 1] }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-display text-3xl text-slate-900">{has ? (display ?? Math.round(value!)) : "—"}</span>
      </div>
      <span className="text-xs font-medium text-slate-600">{label}</span>
    </div>
  );
}

/** Stand-in poster: the offer in big type on the brand gradient. */
export function PosterFallback({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`mx-auto flex aspect-[4/5] w-full max-w-[15rem] items-center justify-center rounded-2xl p-6 text-center shadow-xl ${className}`} style={{ backgroundImage: LOOP_GRADIENT }}>
      <span className="font-display text-4xl leading-tight text-[#ffffff]">{text}</span>
    </div>
  );
}

/** An image that shows `fallback` instead of a broken-image box when it fails to load. */
export function Img({ src, fallback, ...rest }: ImgHTMLAttributes<HTMLImageElement> & { fallback: ReactNode }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  if (!src || bad) return <>{fallback}</>;
  return <img src={src} onError={() => setBad(true)} {...rest} />;
}

/** Real posters fanned out as a stack; the front one cycles. Shows `fallback` if none of them load. */
export function PostStack({ posters: all, onOpen, className = "", fallback = null }: {
  posters: { src: string; alt: string; tag?: string }[]; onOpen?: () => void; className?: string; fallback?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const [front, setFront] = useState(0);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const posters = all.filter((p) => !failed.includes(p.src));
  const count = posters.length;
  useEffect(() => {
    if (reduce || paused || count < 2) return;
    const id = window.setInterval(() => setFront((f) => (f + 1) % count), 3600);
    return () => window.clearInterval(id);
  }, [reduce, paused, count]);
  if (!count) return <>{fallback}</>;
  if (front >= count) { setFront(0); return null; }
  const order = posters.map((_, i) => (i - front + count) % count);
  const fan = [
    { rotate: 0, x: 0, y: 0, scale: 1 },
    { rotate: 6, x: 28, y: 8, scale: 0.94 },
    { rotate: -7, x: -26, y: 12, scale: 0.9 },
    { rotate: 11, x: 46, y: 20, scale: 0.86 },
  ];
  const current = posters[front];
  return (
    <div className={`relative ${className}`} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="relative mx-auto aspect-[4/5] w-full max-w-[15rem]">
        {posters.map((p, i) => {
          const depth = order[i];
          const f = fan[Math.min(depth, fan.length - 1)];
          return (
            <motion.button key={p.src + i} type="button" tabIndex={depth === 0 ? 0 : -1} aria-hidden={depth !== 0}
              onClick={() => (depth === 0 && onOpen ? onOpen() : setFront(i))}
              className={`absolute inset-0 overflow-hidden rounded-2xl border-4 border-[#ffffff] bg-slate-100 shadow-xl dark:border-[#1c1917] ${focusCls}`}
              style={{ zIndex: 10 - depth }}
              initial={false}
              animate={{ rotate: f.rotate, x: f.x, y: f.y, scale: f.scale, opacity: depth > 3 ? 0 : 1 }}
              transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.22, duration: 0.7 }}>
              <img src={p.src} alt={depth === 0 ? p.alt : ""} className="h-full w-full object-cover"
                onError={() => setFailed((f) => (f.includes(p.src) ? f : [...f, p.src]))} />
            </motion.button>
          );
        })}
      </div>
      {current?.tag && <p className="mt-6 text-center text-xs font-medium text-slate-700">{current.tag}</p>}
      {count > 1 && (
        <div className={`${current?.tag ? "mt-2" : "mt-6"} flex justify-center gap-1.5`}>
          {posters.map((p, i) => (
            <button key={i} type="button" onClick={() => setFront(i)} aria-label={`Show ${p.alt}`} aria-current={i === front}
              className={`h-1.5 rounded-full transition-all ${focusCls} ${i === front ? "w-5 bg-brand-700" : "w-1.5 bg-slate-300 dark:bg-slate-600"}`} />
          ))}
        </div>
      )}
      <span className="sr-only" aria-live="polite">{current?.alt}</span>
    </div>
  );
}

/** A one-shot confetti burst in the brand colours. Skipped when the viewer prefers reduced motion. */
export function fireConfetti(origin?: { x: number; y: number }) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "60" });
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) { canvas.remove(); return; }
  ctx.scale(dpr, dpr);
  const colors = ["#ea580c", "#f97316", "#fdba74", "#ec4899", "#f9a8d4", "#06b6d4", "#facc15"];
  const ox = origin?.x ?? window.innerWidth / 2;
  const oy = origin?.y ?? window.innerHeight / 3;
  const parts = Array.from({ length: 150 }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const speed = 7 + Math.random() * 9;
    return {
      x: ox, y: oy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      w: 5 + Math.random() * 6, h: 8 + Math.random() * 8, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)], round: Math.random() < 0.3,
    };
  });
  const start = performance.now();
  const tick = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of parts) {
      p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 2400);
      ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < 2400) requestAnimationFrame(tick); else canvas.remove();
  };
  requestAnimationFrame(tick);
}

/** Fades and lifts a section in once, the first time it scrolls into view. */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

