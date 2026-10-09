import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Aurora, BorderBeam, Img, LOOP_GRADIENT, NumberTicker, Reveal } from "../components/fx";
import { PlatformIcon } from "../components/PlatformIcon";
import { api } from "../lib/api";
import { displayOffer } from "../lib/offer";
import { Business, Campaign, LANGUAGES, SocialAccount } from "../lib/types";
import { Button, DocumentTitle, ErrorNote, focusCls } from "../lib/ui";

const WAITING = new Set(["clarifying", "strategy_review", "review"]);
const JOURNEY = ["Plan", "Your posts", "Approve", "Publish"];
const PLATFORM_NAME: Record<string, string> = {
  instagram: "Instagram", whatsapp: "WhatsApp", facebook: "Facebook", linkedin: "LinkedIn", youtube: "YouTube", x: "X",
};
const NATIVE: Record<string, string> = {
  en: "EN", hi: "हिन्दी", kn: "ಕನ್ನಡ", ta: "தமிழ்", te: "తెలుగు", mr: "मराठी", bn: "বাংলা",
  ml: "മലയാളം", gu: "ગુજરાતી", pa: "ਪੰਜਾਬੀ", ur: "اردو", es: "ES", fr: "FR", ar: "العربية", pt: "PT", id: "ID",
};

type Group = "needs" | "going" | "published";
type Action = { label: string; kind: "open" | "again" | "retry" };
type Item = { c: Campaign; group: Group; missing: string[]; action: Action };
type Handlers = {
  busyId: string | null; deletingId: string | null;
  onOpen: (c: Campaign) => void; onRetry: (c: Campaign) => void; onDelete: (c: Campaign) => void;
};

const SECTIONS: { id: Group; label: string; eyebrow: string; hint: string }[] = [
  { id: "needs", label: "Needs you", eyebrow: "Act", hint: "One tap from you moves these forward." },
  { id: "going", label: "Going out", eyebrow: "Watch", hint: "Writing, sending or scheduled. Nothing to do." },
  { id: "published", label: "Published", eyebrow: "Celebrate", hint: "Out in the world. Run one again any time." },
];

const primaryLink = `lm-cta inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white ${focusCls}`;
const ctaCls = `lm-cta inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-70 ${focusCls}`;
const glassBtn = `lm-glass inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 ${focusCls}`;

function byUpdated(a: Campaign, b: Campaign) {
  const au = a.updated_at || a.created_at;
  const bu = b.updated_at || b.created_at;
  return bu.localeCompare(au) || b.created_at.localeCompare(a.created_at);
}
function productOf(c: Campaign) {
  return c.brain?.brief?.product?.trim() || c.brain?.offer?.product || c.title;
}
function languagesOf(c: Campaign) {
  return c.brain?.strategy?.languages?.length ? c.brain.strategy.languages : c.brain?.requested_languages ?? [];
}
function offerTag(c: Campaign): { figure: string; rest: string } | null {
  const typed = displayOffer(c.brain?.brief?.offer?.trim() || "");
  const pct = typed.match(/^(\d{1,3}(?:\.\d+)?%)/);
  if (pct) return { figure: pct[1], rest: typed.slice(pct[1].length).replace(/^[\s,·\-–]+/, "") };
  if (typed) return { figure: typed, rest: "" };
  const figure = displayOffer(c.brain?.offer?.discount?.trim() || c.brain?.offer?.price?.trim() || "");
  return figure ? { figure, rest: "" } : null;
}
function journeyIndex(status: string) {
  if (status === "generating") return 1;
  if (status === "review") return 2;
  if (status === "approved" || status === "publishing" || status === "published") return 3;
  return 0;
}
function publishedLabel(iso: string) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const day = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(at);
  return `Published ${day}`;
}
function whenLabel(iso: string) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("hour")}:${get("minute")}${get("dayPeriod").toLowerCase()}`;
}
function countdown(iso: string, now: number) {
  const ms = Date.parse(iso) - now;
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "due now";
  const m = Math.round(ms / 60000);
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `in ${d} ${d === 1 ? "day" : "days"}`;
}
function useNow(everyMs = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}
function needReason(c: Campaign, missing: string[], failed: boolean) {
  if (failed) return "A post didn't go out";
  if (c.status === "strategy_review") return "Plan ready to check";
  if (c.status === "review") return "Posts ready to approve";
  if (c.status === "clarifying") return "A question for you";
  if (c.status === "approved" && missing.length) return "Account to connect";
  if (c.status === "approved") return "Ready to publish";
  return "Waiting on you";
}

export default function Campaigns() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: () => api.get<Campaign[]>("/campaigns"), refetchOnMount: "always" });
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => api.get<Business[]>("/businesses") });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => api.get<SocialAccount[]>("/social/accounts") });
  const [filter, setFilter] = useState<Group | "all">("all");
  const [query, setQuery] = useState("");
  const [retrying, setRetrying] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const now = useNow();
  const rows = campaigns.data ?? [];
  const shops = businesses.data ?? [];

  if (campaigns.isLoading || businesses.isLoading || accounts.isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <DocumentTitle title="Campaigns" />
        <p className="sr-only">Loading campaigns</p>
        <div className="h-56 animate-pulse rounded-3xl bg-slate-200 motion-reduce:animate-none" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-36 animate-pulse rounded-3xl bg-slate-200 motion-reduce:animate-none" />
          <div className="h-36 animate-pulse rounded-3xl bg-slate-200 motion-reduce:animate-none" />
        </div>
      </div>
    );
  }
  if (campaigns.isError || businesses.isError) {
    return (
      <div className="space-y-2">
        <DocumentTitle title="Campaigns" />
        <ErrorNote error={new Error("Couldn't load this. Try again.")} />
        <Button onClick={() => { campaigns.refetch(); businesses.refetch(); }}>Try again</Button>
      </div>
    );
  }

  const connected = (platform: string, businessId: string) =>
    (accounts.data ?? []).some((a) => a.target_platform === platform && (!a.business_id || a.business_id === businessId));
  const missingOf = (c: Campaign) => (c.brain?.strategy?.platforms ?? []).filter((p) => !connected(p, c.business_id));

  const grouped: Item[] = rows.map((c) => ({ c, ...place(c, missingOf(c)) })).sort((a, b) => byUpdated(a.c, b.c));
  const q = query.trim().toLowerCase();
  const visible = grouped.filter(({ c, group }) => {
    if (filter !== "all" && group !== filter) return false;
    if (q) {
      const offer = c.brain?.brief?.offer ?? "";
      return `${c.title} ${productOf(c)} ${offer}`.toLowerCase().includes(q);
    }
    return true;
  });
  const counts = Object.fromEntries(SECTIONS.map((s) => [s.id, grouped.filter((i) => i.group === s.id).length])) as Record<Group, number>;
  const handlers: Handlers = {
    busyId: retrying, deletingId: deleting,
    onOpen: (c) => nav(`/campaigns/${c.id}`), onRetry: retry, onDelete: remove,
  };

  async function retry(c: Campaign) {
    const ids = c.row?.failed_job_ids ?? [];
    if (!ids.length) return;
    setRetrying(c.id);
    setError(null);
    try {
      await Promise.all(ids.map((id) => api.post(`/publish-jobs/${id}/retry`)));
      await qc.invalidateQueries({ queryKey: ["campaigns"] });
    } catch (err) { setError(err); } finally { setRetrying(null); }
  }

  async function remove(c: Campaign) {
    if (!window.confirm(`Delete “${c.title}”? Its posts are removed from LOOPLY.`)) return;
    setDeleting(c.id);
    setError(null);
    try {
      await api.del(`/campaigns/${c.id}`);
      await qc.invalidateQueries({ queryKey: ["campaigns"] });
    } catch (err) { setError(err); } finally { setDeleting(null); }
  }

  return (
    <div className="space-y-10">
      <DocumentTitle title="Campaigns" />

      <section className="lm-card relative overflow-hidden rounded-3xl border bg-white">
        <Aurora />
        <div className="relative grid items-end gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
          <Reveal>
            <p className="lm-glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-slate-700">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
              {rows.length} {rows.length === 1 ? "campaign" : "campaigns"}{shops.length > 1 ? ` · ${shops.length} shops` : ""}
            </p>
            <h1 className="mt-4 font-display text-6xl leading-[0.95] tracking-tight text-slate-900">Campaigns</h1>
            <p className="mt-3 max-w-md font-display text-2xl leading-snug text-slate-800">
              Everything you said, and <em className="lm-gradient-text pr-1">where it went</em>.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {shops.length === 0
                ? <Link className={primaryLink} to="/businesses/new">Add a business</Link>
                : <Link className={primaryLink} to="/campaigns/new"><PlusIcon />New campaign</Link>}
              {rows.length > 6 && (
                <label className="lm-glass flex min-w-[14rem] flex-1 items-center gap-2 rounded-xl px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-brand-500">
                  <SearchIcon />
                  <input aria-label="Search campaigns" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or offer"
                    className="w-full bg-transparent text-slate-900 outline-none placeholder:text-slate-500" />
                </label>
              )}
            </div>
          </Reveal>
          {rows.length > 0 && (
            <div>
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Show campaigns that">
                {SECTIONS.map((s) => {
                  const on = filter === s.id;
                  const hot = s.id === "needs" && counts.needs > 0;
                  return (
                    <button key={s.id} type="button" aria-pressed={on} onClick={() => setFilter(on ? "all" : s.id)}
                      className={`lm-glass rounded-2xl px-4 py-3 text-left transition duration-200 motion-reduce:transition-none ${focusCls} ${on ? "ring-2 ring-brand-600" : hot ? "ring-2 ring-brand-300 hover:-translate-y-0.5" : "hover:-translate-y-0.5"}`}>
                      <span className="block text-xs font-medium text-slate-600">{s.label}</span>
                      <span className={`mt-1 block font-display text-5xl leading-none ${hot || on ? "lm-gradient-text" : "text-slate-900"}`}><NumberTicker value={counts[s.id]} /></span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-right text-xs text-slate-600">
                {filter === "all"
                  ? "Tap a number to show just those."
                  : <>Showing {SECTIONS.find((s) => s.id === filter)?.label.toLowerCase()} · <button type="button" onClick={() => setFilter("all")} className={`font-semibold text-brand-700 underline ${focusCls}`}>Show all</button></>}
              </p>
            </div>
          )}
        </div>
      </section>

      <ErrorNote error={error} />

      {rows.length === 0 && (
        <p className="text-sm text-slate-600">
          {shops.length === 0
            ? "Add your business first. Then describe one promotion and LOOPLY drafts it in your customers' language."
            : "No campaigns yet. Describe one promotion and LOOPLY drafts it in your customers' language."}
        </p>
      )}
      {rows.length > 0 && visible.length === 0 && (
        <p className="text-sm text-slate-600">Nothing matches that. <button type="button" className={`font-semibold text-brand-700 underline ${focusCls}`} onClick={() => { setQuery(""); setFilter("all"); }}>Clear the search</button></p>
      )}

      {SECTIONS.map((section) => {
        const items = visible.filter((item) => item.group === section.id);
        if (!items.length) return null;
        return (
          <section key={section.id} className="space-y-4" aria-labelledby={`sec-${section.id}`}>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">{section.eyebrow}</p>
                <h2 id={`sec-${section.id}`} className="font-display text-4xl leading-tight text-slate-900">
                  {section.label} <span className="text-slate-500">· {items.length}</span>
                </h2>
              </div>
              <p className="text-sm text-slate-600">{section.hint}</p>
            </div>
            {section.id === "needs" && (
              <div className="grid gap-4 lg:grid-cols-2">
                {items.map((item, i) => (
                  <Reveal key={item.c.id} delay={Math.min(i, 6) * 0.04} className={i === 0 ? "lg:col-span-2" : ""}>
                    <ActionCard item={item} featured={i === 0} now={now} {...handlers} />
                  </Reveal>
                ))}
              </div>
            )}
            {section.id === "going" && <Timeline items={items} now={now} {...handlers} />}
            {section.id === "published" && (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {items.map((item, i) => (
                  <Reveal key={item.c.id} delay={Math.min(i, 8) * 0.04}>
                    <PosterTile item={item} {...handlers} />
                  </Reveal>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function place(c: Campaign, missing: string[]): { group: Group; missing: string[]; action: Action } {
  const failed = (c.row?.failed_job_ids.length ?? 0) > 0;
  const live = (c.row?.platforms ?? []).some((p) => p.state === "sending" || p.state === "scheduled");
  const scheduled = !!c.row?.next_at;
  let group: Group = "needs";
  if (c.status === "published") group = "published";
  else if (failed || WAITING.has(c.status) || (c.status === "approved" && (missing.length > 0 || !scheduled))) group = "needs";
  else if (c.status === "generating" || live || (c.status === "approved" && scheduled && missing.length === 0) || c.status === "publishing") group = "going";
  const action = actionFor(c, missing, failed);
  return { group, missing, action };
}

function actionFor(c: Campaign, missing: string[], failed: boolean): Action {
  if (failed) return { label: "Retry", kind: "retry" };
  if (c.status === "strategy_review") return { label: "Check the plan", kind: "open" };
  if (c.status === "review") return { label: "Approve", kind: "open" };
  if (c.status === "clarifying") return { label: "Answer", kind: "open" };
  if (c.status === "approved" && missing.length === 1) return { label: `Connect ${PLATFORM_NAME[missing[0]] ?? missing[0]}`, kind: "open" };
  if (c.status === "approved" && missing.length > 1) return { label: "Connect accounts", kind: "open" };
  if (c.status === "approved") return { label: "Publish", kind: "open" };
  if (c.status === "published") return { label: "Run again", kind: "again" };
  return { label: "View", kind: "open" };
}

function ActionButton({ c, action, busyId, onOpen, onRetry, className = ctaCls }: {
  c: Campaign; action: Action; className?: string;
} & Pick<Handlers, "busyId" | "onOpen" | "onRetry">) {
  if (action.kind === "again") return <Link to={`/campaigns/new?from=${c.id}`} className={className}>Run again</Link>;
  if (action.kind === "retry") {
    return <button type="button" className={className} disabled={busyId === c.id} onClick={() => onRetry(c)}>{busyId === c.id ? "Retrying…" : "Retry"}</button>;
  }
  return <button type="button" className={className} onClick={() => onOpen(c)}>{action.label} <span aria-hidden="true">→</span></button>;
}

function ActionCard({ item, featured, now, ...h }: { item: Item; featured: boolean; now: number } & Handlers) {
  const { c, missing, action } = item;
  const offer = offerTag(c);
  const failed = (c.row?.platforms ?? []).some((p) => p.state === "failed");
  const used = c.brain?.strategy?.platforms ?? [];
  const states = new Map((c.row?.platforms ?? []).map((p) => [p.platform, p.state]));
  const line = statusLine(c, missing);
  const langs = languagesOf(c);
  const next = c.row?.next_at;

  const body = (
    <div className={`flex flex-col gap-4 sm:flex-row sm:items-center ${featured ? "p-5 sm:p-6" : "p-4"}`}>
      <Link to={`/campaigns/${c.id}`} className={`flex min-w-0 flex-1 items-center gap-4 rounded-2xl ${focusCls}`}>
        <Poster c={c} className={featured ? "h-36 w-28" : "h-24 w-20"} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-700">
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${failed || missing.length ? "bg-amber-500" : "bg-brand-600"}`} />
            {needReason(c, missing, failed)}
          </p>
          <p className={`mt-1 line-clamp-2 font-display leading-tight text-slate-900 ${featured ? "text-3xl" : "text-2xl"}`}>{c.title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {offer && (
              <span className="rounded-lg bg-brand-50 px-2 py-0.5 text-xs">
                <span className="font-semibold text-brand-700">{offer.figure}</span>
                {offer.rest && <span className="text-slate-600"> {offer.rest}</span>}
              </span>
            )}
            {next && <span className="lm-glass rounded-full px-2 py-0.5 text-[11px] text-slate-700">{whenLabel(next)} · {countdown(next, now)}</span>}
          </div>
          <MiniJourney c={c} attention />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            {used.map((p) => (
              <span key={p} className="relative inline-flex" title={PLATFORM_NAME[p] ?? p}>
                <PlatformIcon platform={p} className="h-4 w-4 text-slate-900" />
                <span aria-hidden="true" className={`absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-2 ring-white dark:ring-[#0f0f0f] ${dotClass(states.get(p), missing.includes(p))}`} />
                <span className="sr-only">{PLATFORM_NAME[p] ?? p}, {states.get(p) ?? (missing.includes(p) ? "not connected" : "included")}</span>
              </span>
            ))}
            {langs.length > 0 && <span>{langs.map((l) => NATIVE[l] ?? LANGUAGES[l] ?? l).join(" · ")}</span>}
          </div>
          {line && <p className="mt-1.5 text-xs text-slate-600">{line}</p>}
        </div>
      </Link>
      <div className="flex items-center gap-2 sm:flex-col sm:items-end">
        <ActionButton c={c} action={action} {...h} />
        <MoreMenu title={c.title} deleting={h.deletingId === c.id} onDelete={() => h.onDelete(c)} />
      </div>
    </div>
  );
  return featured
    ? <BorderBeam radius="rounded-3xl">{body}</BorderBeam>
    : <div className="lm-card h-full rounded-3xl border bg-white transition-transform duration-300 hover:-translate-y-0.5 motion-reduce:transition-none">{body}</div>;
}

function Timeline({ items, now, ...h }: { items: Item[]; now: number } & Handlers) {
  const entries = items.map((item) => {
    const { c } = item;
    const sending = c.status === "publishing" || (c.row?.platforms ?? []).some((p) => p.state === "sending");
    const writing = c.status === "generating";
    const next = c.row?.next_at;
    const when = sending ? "Sending now" : writing ? "Writing posts" : next ? whenLabel(next) : "Getting ready";
    return { item, live: sending || writing, when, soon: !sending && !writing && next ? countdown(next, now) : "", at: next ?? "" };
  }).sort((a, b) => Number(b.live) - Number(a.live) || (a.at || "~").localeCompare(b.at || "~"));

  return (
    <div className="lm-card rounded-3xl border bg-white p-5 sm:p-6">
      <div className="overflow-x-auto pb-2">
        <ol className="relative flex min-w-max gap-5">
          <span aria-hidden="true" className="absolute left-2 right-2 top-2 h-0.5 rounded-full"
            style={{ backgroundImage: "linear-gradient(90deg,#fdba74,#f9a8d4,#a5f3fc)" }} />
          {entries.map(({ item, live, when, soon }) => {
            const { c } = item;
            const used = c.brain?.strategy?.platforms ?? [];
            return (
              <li key={c.id} className="relative w-64 shrink-0">
                <span className="relative flex h-4 w-4 items-center justify-center">
                  {live && <span aria-hidden="true" className="lm-pulse-ring absolute inset-0 rounded-full bg-brand-500" />}
                  <span className={`relative h-3 w-3 rounded-full ring-4 ring-white dark:ring-[#0f0f0f] ${live ? "bg-brand-600" : "bg-pink-500"}`} />
                </span>
                <p className="mt-2 flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-slate-900">{when}</span>
                  {soon && <span className="text-[11px] font-medium text-brand-700">{soon}</span>}
                </p>
                <div className="lm-glass mt-3 flex items-start gap-3 rounded-2xl p-3 transition-transform duration-300 hover:-translate-y-0.5 motion-reduce:transition-none">
                  <Link to={`/campaigns/${c.id}`} className={`flex min-w-0 flex-1 gap-3 rounded-xl ${focusCls}`}>
                    <Poster c={c} className="h-16 w-14" />
                    <span className="min-w-0">
                      <span className="line-clamp-2 font-display text-lg leading-tight text-slate-900">{c.title}</span>
                      <span className="mt-1.5 flex items-center gap-1.5">
                        {used.map((p) => <PlatformIcon key={p} platform={p} className="h-3.5 w-3.5 text-slate-900" />)}
                      </span>
                      {statusLine(c, item.missing) && <span className="mt-1 block text-[11px] text-slate-600">{statusLine(c, item.missing)}</span>}
                    </span>
                  </Link>
                  <MoreMenu title={c.title} deleting={h.deletingId === c.id} onDelete={() => h.onDelete(c)} small />
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function PosterTile({ item, ...h }: { item: Item } & Handlers) {
  const { c, missing, action } = item;
  const offer = offerTag(c);
  const failed = (c.row?.platforms ?? []).some((p) => p.state === "failed");
  const healthy = !failed && !(c.row?.stale_count);
  const line = statusLine(c, missing);
  const poster = c.row?.poster_url ?? undefined;
  const used = c.brain?.strategy?.platforms ?? [];
  return (
    <div className="group relative">
      <Link to={`/campaigns/${c.id}`} className={`lm-card block overflow-hidden rounded-2xl border bg-white transition duration-300 hover:-translate-y-1 hover:shadow-xl motion-reduce:transition-none ${focusCls}`}>
        <div className="relative aspect-[4/5] overflow-hidden" style={{ backgroundImage: LOOP_GRADIENT }}>
          <Img src={poster} alt="" aria-hidden="true" fallback={null} className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-xl" />
          <Img src={poster} alt={`Poster for ${c.title}`} className="relative h-full w-full object-contain"
            fallback={<span className="flex h-full items-center justify-center p-4 pb-20 text-center font-display text-4xl leading-tight text-[#ffffff]">{offer?.figure || productOf(c)}</span>} />
          <span className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-[#ffffff] ${healthy ? "bg-emerald-600" : "bg-amber-600"}`}>
            {healthy ? "✓ Published" : "Needs a look"}
          </span>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#000000]/80 via-[#000000]/35 to-transparent p-3 pt-12">
            <p className="line-clamp-2 font-display text-xl leading-tight text-[#ffffff]">{c.title}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#ffffff]/85">
              {c.row?.published_at && <span>{publishedLabel(c.row.published_at)}</span>}
              {used.map((p) => <PlatformIcon key={p} platform={p} mono className="h-3.5 w-3.5" />)}
            </p>
          </div>
        </div>
      </Link>
      {!healthy && line && <p className="mt-2 text-xs text-amber-800">{line}</p>}
      <div className={`absolute right-2 top-2 flex items-center gap-1 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100 ${healthy ? "opacity-0" : "opacity-100"}`}>
        <ActionButton c={c} action={action} {...h} className={glassBtn} />
        <MoreMenu title={c.title} deleting={h.deletingId === c.id} onDelete={() => h.onDelete(c)} small />
      </div>
    </div>
  );
}

function MiniJourney({ c, attention }: { c: Campaign; attention?: boolean }) {
  const stage = journeyIndex(c.status);
  const published = c.status === "published";
  return (
    <div className="mt-3" role="img" aria-label={published ? "Published" : `Step ${stage + 1} of 4: ${JOURNEY[stage]}`}>
      <div className="flex gap-1">
        {JOURNEY.map((label, i) => {
          const done = published || i < stage;
          const current = !published && i === stage;
          return (
            <span key={label} className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f1e3d1] dark:bg-[#292524]">
              {(done || current) && (
                <span className="block h-full rounded-full" style={{
                  backgroundImage: done ? "linear-gradient(90deg,#059669,#10b981)" : attention ? "linear-gradient(90deg,#ea580c,#db2777)" : "linear-gradient(90deg,#f97316,#fb923c)",
                }} />
              )}
            </span>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{published ? "All four steps done" : `Step ${stage + 1} of 4 · ${JOURNEY[stage]}`}</p>
    </div>
  );
}

function Poster({ c, className }: { c: Campaign; className: string }) {
  const offer = offerTag(c);
  const letter = (c.title.trim()[0] || "?").toUpperCase();
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-2xl shadow-md ${className}`} style={{ backgroundImage: LOOP_GRADIENT }}>
      <Img src={c.row?.poster_url ?? undefined} alt="" className="h-full w-full object-cover"
        fallback={<span className="flex h-full w-full items-center justify-center p-1.5 text-center font-display text-xl leading-none text-[#ffffff]">{offer?.figure && offer.figure.length <= 8 ? offer.figure : letter}</span>} />
    </span>
  );
}

function MoreMenu({ title, deleting, onDelete, small = false }: { title: string; deleting: boolean; onDelete: () => void; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`More for ${title}`} onClick={() => setOpen(!open)}
        className={`lm-glass flex items-center justify-center rounded-xl text-slate-700 hover:text-slate-900 ${small ? "h-8 w-8" : "h-9 w-9"} ${focusCls}`}>
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4"><circle cx="3.5" cy="8" r="1.3" fill="currentColor" /><circle cx="8" cy="8" r="1.3" fill="currentColor" /><circle cx="12.5" cy="8" r="1.3" fill="currentColor" /></svg>
      </button>
      {open && (
        <MenuPanel>
          <button type="button" role="menuitem" disabled={deleting} onClick={() => { setOpen(false); onDelete(); }}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50 ${focusCls}`}>
            {deleting ? "Deleting…" : "Delete campaign"}
          </button>
        </MenuPanel>
      )}
    </div>
  );
}

function MenuPanel({ children }: { children: ReactNode }) {
  return <div role="menu" className="lm-card absolute right-0 top-full z-30 mt-1.5 min-w-[11rem] rounded-xl border bg-white p-1 shadow-xl">{children}</div>;
}

function statusLine(c: Campaign, missing: string[]) {
  const stale = c.row?.stale_count ?? 0;
  if (stale > 0) return `Offer updated · ${stale} ${stale === 1 ? "post" : "posts"} to refresh`;
  const parts = (c.row?.platforms ?? []).map((p) => {
    const name = PLATFORM_NAME[p.platform] ?? p.platform;
    if (p.state === "failed") return `${name} failed`;
    if (p.state === "sending") return `${name} sending`;
    if (p.state === "scheduled") return `${name} scheduled`;
    if (p.state === "done" && c.status === "publishing") return `${name} done`;
    return "";
  }).filter(Boolean);
  for (const p of missing) {
    const name = PLATFORM_NAME[p] ?? p;
    if (!parts.some((line) => line.startsWith(name))) parts.push(`${name} isn't connected`);
  }
  return parts.join(" · ");
}

function dotClass(state: string | undefined, missing: boolean) {
  if (state === "failed") return "bg-red-500";
  if (missing) return "bg-amber-500";
  if (state === "sending" || state === "scheduled") return "bg-sky-500";
  if (state === "done") return "bg-emerald-500";
  return "bg-slate-400";
}

function PlusIcon() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}
function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-slate-500"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}
