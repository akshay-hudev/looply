import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Fragment, useEffect, useState } from "react";

import { AgentEvent, Asset, LANGUAGES, PLATFORM_LABELS } from "../lib/types";

// Adapted from 21st.dev "AI Task List" (educalvolpz): rows tick in place, finished rows go quiet,
// and only the running row moves. Counts are derived from the rows so the header never disagrees.

type TaskStatus = "pending" | "running" | "done";
type Task = { id: string; label: string; status: TaskStatus; children?: Task[] };

const PLAN = ["intake", "business", "locality", "audience", "strategy"] as const;
const PRODUCE = ["content", "localization", "performance", "media", "review"] as const;
const FORMAT_WORDS: Record<string, string> = {
  post: "post", story: "story", reel: "reel", carousel: "carousel", poster: "poster",
  message: "message", offer_card: "offer card", short: "short",
};

const LOOP_GRADIENT = "linear-gradient(90deg, #ea580c 0%, #f97316 45%, #ec4899 75%, #06b6d4 100%)";

function stepStatus(order: readonly string[], stage: string, id: string): TaskStatus {
  const at = order.indexOf(stage);
  const me = order.indexOf(id);
  if (at < 0) return "pending";
  return me < at ? "done" : me === at ? "running" : "pending";
}

function seen(events: AgentEvent[], agent: string, status: string, prefix = "") {
  return events.some((e) => e.agent === agent && e.status === status && e.message.startsWith(prefix));
}

function planTasks(stage: string, shopName: string): Task[] {
  const labels: Record<(typeof PLAN)[number], string> = {
    intake: "Reading what you asked for",
    business: `Getting to know ${shopName}`,
    locality: "Studying the neighbourhood",
    audience: "Working out who to talk to",
    strategy: "Choosing platforms, formats and timing",
  };
  return PLAN.map((id) => ({ id, label: labels[id], status: stepStatus(PLAN, stage, id) }));
}

function produceTasks(stage: string, events: AgentEvent[], assets: Asset[], platforms: string[], languages: string[]): Task[] {
  // The fact check runs inside the media stage, so its events decide where media ends.
  const truthStarted = seen(events, "truth_engine", "started");
  const truthDone = seen(events, "truth_engine", "completed");
  const status = (id: (typeof PRODUCE)[number]): TaskStatus => {
    if (id === "media" && truthStarted) return "done";
    if (id === "review") return truthDone ? "done" : truthStarted || stage === "review" ? "running" : "pending";
    return stepStatus(PRODUCE, stage, id);
  };
  const content = status("content");
  const langNames = languages.map((l) => LANGUAGES[l] ?? l).join(", ");
  return [
    {
      id: "content", label: "Writing the main message and every post", status: content,
      children: platforms.map((p) => {
        const name = PLATFORM_LABELS[p] ?? p;
        const written = content === "done" || seen(events, "platform_agent", "completed", `${name}:`) || assets.some((a) => a.platform === p);
        return { id: `content-${p}`, label: name, status: written ? "done" : content === "running" ? "running" : "pending" };
      }),
    },
    { id: "localization", label: langNames ? `Adapting it for ${langNames}` : "Adapting it for each language", status: status("localization") },
    { id: "performance", label: "Scoring every version and keeping the best", status: status("performance") },
    { id: "media", label: "Designing the pictures", status: status("media") },
    { id: "review", label: "Checking every price and date against your facts", status: status("review") },
  ];
}

function humanize(message: string): string {
  const name = (p: string) => PLATFORM_LABELS[p] ?? p;
  const fmt = (f: string) => FORMAT_WORDS[f] ?? f.replaceAll("_", " ");
  const lang = (l: string) => LANGUAGES[l] ?? l;
  let m = message.match(/^Adapting (\w+) (\w+) into (\w+)$/);
  if (m) return `Adapting the ${name(m[1])} ${fmt(m[2])} into ${lang(m[3])}`;
  m = message.match(/^Predicting (\w+) (\w+) \((\w+)\)$/);
  if (m) return `Scoring the ${name(m[1])} ${fmt(m[2])} in ${lang(m[3])}`;
  m = message.match(/^Optimizing variant (\w+) of (\w+) (\w+) \((\w+)\)$/);
  if (m) return `Polishing version ${m[1]} of the ${name(m[2])} ${fmt(m[3])}`;
  m = message.match(/^(?:Creating|Submitting) (\w+) (\w+) (?:image|video) \((\w+)\)$/);
  if (m) return `Designing the ${name(m[1])} ${fmt(m[2])} in ${lang(m[3])}`;
  return message;
}

function useElapsed(since: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function TaskBox({ status, reduce }: { status: TaskStatus; reduce: boolean }) {
  const done = status === "done";
  return (
    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
      <svg aria-hidden="true" viewBox="0 0 14 14" className="h-4 w-4">
        <motion.rect x={1} y={1} width={12} height={12} rx={3.5} strokeWidth={1.4} fill="#059669"
          animate={{ fillOpacity: done ? 0.15 : 0, stroke: done ? "#059669" : status === "running" ? "#c2410c" : "currentColor" }}
          transition={reduce ? { duration: 0 } : { duration: 0.2 }} />
        {done && (
          <path className="lm-draw" d="M 3.5 7.5 L 6 10 L 10.5 4.5" fill="none" pathLength={1} stroke="#059669"
            strokeDasharray="1 1" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
        )}
      </svg>
    </span>
  );
}

function TaskRow({ task, depth, reduce }: { task: Task; depth: number; reduce: boolean }) {
  const running = task.status === "running";
  const done = task.status === "done";
  return (
    <motion.li animate={{ opacity: done ? 0.65 : 1 }} transition={reduce ? { duration: 0 } : { duration: 0.25 }}
      style={{ paddingLeft: depth * 22 }}>
      <span className={`relative flex items-start gap-2 py-1 ${depth ? "text-xs" : "text-sm"}`}>
        <TaskBox status={task.status} reduce={reduce} />
        <span className={`min-w-0 flex-1 leading-snug ${running ? "font-medium text-slate-900" : "text-slate-700"}`}>{task.label}</span>
        <span className="sr-only">{done ? "done" : running ? "in progress" : "waiting"}</span>
        {running && !reduce && (
          <motion.span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-px text-brand-700"
            style={{ backgroundImage: "linear-gradient(90deg, transparent 0%, currentColor 50%, transparent 100%)", backgroundSize: "50% 100%", opacity: 0.6 }}
            animate={{ backgroundPositionX: ["0%", "200%"] }}
            transition={{ duration: 1.4, ease: [0.645, 0.045, 0.355, 1], repeat: Infinity }} />
        )}
      </span>
    </motion.li>
  );
}

function AmplifyGrid({ platforms, languages, assets, reduce }: { platforms: string[]; languages: string[]; assets: Asset[]; reduce: boolean }) {
  const cell = (p: string, l: string) => {
    const mine = assets.filter((a) => a.platform === p && a.language === l);
    if (mine.some((a) => a.verification?.status === "verified" || ["verified", "approved"].includes(a.status))) return "checked";
    return mine.length ? "written" : "waiting";
  };
  const total = platforms.length * languages.length;
  const filled = platforms.flatMap((p) => languages.map((l) => cell(p, l))).filter((c) => c !== "waiting").length;
  const columns = `minmax(5.5rem, auto) repeat(${languages.length}, minmax(2.25rem, max-content))`;
  return (
    <div className="rounded-xl bg-slate-100 p-4">
      <p className="text-sm font-medium text-slate-900">One message, {total} {total === 1 ? "place" : "places"}</p>
      <p className="text-xs text-slate-600">{filled} of {total} written</p>
      <div className="mt-3 grid items-center gap-x-2 gap-y-1.5" style={{ gridTemplateColumns: columns }}>
        <span />
        {languages.map((l) => <span key={l} className="text-center text-[11px] text-slate-600">{LANGUAGES[l] ?? l}</span>)}
        {platforms.map((p) => (
          <Fragment key={p}>
            <span className="truncate text-xs font-medium text-slate-700">{PLATFORM_LABELS[p] ?? p}</span>
            {languages.map((l) => {
              const state = cell(p, l);
              const label = `${PLATFORM_LABELS[p] ?? p}, ${LANGUAGES[l] ?? l}: ${state}`;
              return (
                <span key={l} role="img" aria-label={label} title={label}
                  className="relative mx-auto flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-slate-300">
                  <AnimatePresence>
                    {state !== "waiting" && (
                      <motion.span key={state} className={`absolute inset-0 flex items-center justify-center rounded-lg ${state === "checked" ? "bg-emerald-600 text-white" : "bg-brand-700 text-white"}`}
                        initial={reduce ? false : { scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}>
                        <svg aria-hidden="true" viewBox="0 0 10 10" className="h-3 w-3">
                          {state === "checked"
                            ? <path d="M1.5 5.2 3.4 7.1 8.5 2.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                            : <circle cx="5" cy="5" r="2" fill="currentColor" />}
                        </svg>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-brand-700" />Written</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />Checked</span>
      </div>
    </div>
  );
}

export function AgentChecklist({ stage, events, assets, platforms, languages, shopName, headline }: {
  stage: string;
  events: AgentEvent[];
  assets: Asset[];
  platforms: string[];
  languages: string[];
  shopName: string;
  headline: string;
}) {
  const reduce = Boolean(useReducedMotion());
  const planning = (PLAN as readonly string[]).includes(stage);
  const tasks = planning ? planTasks(stage, shopName) : produceTasks(stage, events, assets, platforms, languages);
  const all = tasks.flatMap((t) => [t, ...(t.children ?? [])]);
  const done = all.filter((t) => t.status === "done").length;
  const [mountedAt] = useState(Date.now);
  const firstEvent = events.find((e) => e.created_at)?.created_at;
  const since = firstEvent ? Math.min(Date.parse(firstEvent), mountedAt) : mountedAt;
  const elapsed = useElapsed(Number.isNaN(since) ? mountedAt : since);
  const latest = [...events].reverse().find((e) => e.status === "started");
  const showGrid = !planning && platforms.length > 0 && languages.length > 0;

  return (
    <section aria-label="What LOOPLY is doing" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <style>{`
        .lm-draw { stroke-dashoffset: 0; }
        @media (prefers-reduced-motion: no-preference) {
          .lm-draw { animation: lm-draw 220ms cubic-bezier(0.23, 1, 0.32, 1) both; }
        }
        @keyframes lm-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
      `}</style>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium text-brand-700">
            <span className="relative flex h-2 w-2">
              {!reduce && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" />}
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-700" />
            </span>
            {planning ? "Making your plan" : "Writing your posts"}
          </p>
          <p role="status" className="mt-1 text-lg font-semibold text-slate-900">{headline}</p>
        </div>
        <p className="text-right text-xs text-slate-600">
          <span className="block font-mono text-sm tabular-nums text-slate-900">{elapsed}</span>
          {done}/{all.length} done
        </p>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <motion.div className="h-full rounded-full" style={{ backgroundImage: LOOP_GRADIENT }}
          initial={false} animate={{ width: `${Math.max(4, (done / Math.max(all.length, 1)) * 100)}%` }}
          transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.6 }} />
      </div>

      <div className={`mt-4 ${showGrid ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,auto)]" : ""}`}>
        <ul className="list-none">
          {tasks.map((task) => (
            <Fragment key={task.id}>
              <TaskRow task={task} depth={0} reduce={reduce} />
              {task.children?.map((child) => <TaskRow key={child.id} task={child} depth={1} reduce={reduce} />)}
            </Fragment>
          ))}
        </ul>
        {showGrid && <AmplifyGrid platforms={platforms} languages={languages} assets={assets} reduce={reduce} />}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-xs text-slate-600">
        <div className="min-h-[1rem] min-w-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            {latest && (
              <motion.p key={latest.seq} className="truncate"
                initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}>
                Now: {humanize(latest.message)}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <p>You can leave this page. The campaign keeps going.</p>
      </div>
    </section>
  );
}
