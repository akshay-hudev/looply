import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

import { focusCls } from "../lib/ui";

// Adapted from 21st.dev "AI Voice Input" (kokonutd): a mic button, a running timer and a bar
// visualizer. Here the bars and the halo follow the real microphone level instead of random heights.

const BARS = 28;
const LOOP_GRADIENT = "linear-gradient(135deg, #ea580c 0%, #f97316 40%, #ec4899 75%, #06b6d4 100%)";

export type VoicePhase = "idle" | "listening" | "writing";

function useMicLevels(stream: MediaStream | null, bars: React.RefObject<(HTMLSpanElement | null)[]>, onLevel: (v: number) => void) {
  useEffect(() => {
    if (!stream) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.75;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      // Voice sits in the lower bins; spread those across the bars.
      const usable = Math.floor(data.length * 0.7);
      (bars.current ?? []).forEach((el, i) => {
        const v = data[Math.floor((i / BARS) * usable)] / 255;
        sum += v;
        if (el) el.style.height = `${Math.max(12, v * 100)}%`;
      });
      onLevel(Math.min(1, (sum / BARS) * 1.8));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      onLevel(0);
      (bars.current ?? []).forEach((el) => { if (el) el.style.height = ""; });
      ctx.close().catch(() => undefined);
    };
  }, [stream, bars, onLevel]);
}

function useTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) { setSeconds(0); return; }
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function VoiceOrb({ phase, stream, idleLabel, onClick }: {
  phase: VoicePhase;
  stream: MediaStream | null;
  idleLabel: string;
  onClick: () => void;
}) {
  const reduce = Boolean(useReducedMotion());
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const level = useMotionValue(0);
  const smooth = useSpring(level, { stiffness: 260, damping: 26 });
  const haloScale = useTransform(smooth, [0, 1], [1, 1.45]);
  const haloOpacity = useTransform(smooth, [0, 1], [0.18, 0.55]);
  const setLevel = useCallback((v: number) => level.set(v), [level]);
  useMicLevels(phase === "listening" ? stream : null, bars, setLevel);
  const listening = phase === "listening";
  const writing = phase === "writing";
  const time = useTimer(listening);

  const status = listening ? "Listening. Click to stop." : writing ? "Writing that down…" : idleLabel;

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative flex h-32 w-32 items-center justify-center">
        <motion.span aria-hidden="true" className="absolute inset-3 rounded-full blur-xl"
          style={{ backgroundImage: LOOP_GRADIENT, scale: reduce ? 1 : haloScale, opacity: listening ? (reduce ? 0.35 : haloOpacity) : 0.15 }} />
        <button type="button" onClick={onClick} disabled={writing} aria-pressed={listening}
          aria-label={listening ? "Stop recording" : writing ? "Writing that down" : idleLabel}
          className={`relative rounded-full p-[3px] shadow-md transition-transform hover:scale-[1.03] active:scale-95 disabled:cursor-wait motion-reduce:transition-none motion-reduce:hover:scale-100 ${focusCls}`}
          style={{ backgroundImage: LOOP_GRADIENT }}>
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-slate-900">
            {listening ? (
              <span className="h-6 w-6 rounded-md bg-brand-700" />
            ) : writing ? (
              <span className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-brand-700 border-t-transparent motion-reduce:animate-none" />
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
              </svg>
            )}
          </span>
        </button>
      </div>

      <span className={`font-mono text-sm tabular-nums transition-opacity ${listening ? "text-slate-900" : "text-slate-500 opacity-60"}`}>{time}</span>

      <div aria-hidden="true" className="flex h-6 w-56 items-center justify-center gap-[3px]">
        {Array.from({ length: BARS }, (_, i) => (
          <span key={i} ref={(el) => { bars.current[i] = el; }}
            className={`w-[3px] rounded-full transition-[height] duration-75 ${listening ? "h-[12%] bg-brand-700" : "h-1 bg-slate-200"}`} />
        ))}
      </div>

      <p role="status" className="text-sm text-slate-600">{status}</p>
    </div>
  );
}
