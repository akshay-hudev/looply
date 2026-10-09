import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

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
const TINTS = ["bg-brand-100 text-brand-700", "bg-amber-100 text-amber-800", "bg-sky-100 text-sky-800", "bg-emerald-100 text-emerald-800"];

type Group = "needs" | "going" | "published";

const primaryLink = `inline-flex items-center rounded-lg bg-brand-700 px-4 py-2 font-medium text-white hover:bg-brand-800 ${focusCls}`;
const actionCls = `inline-flex items-center rounded-lg border border-slate-500 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 ${focusCls}`;

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

export default function Campaigns() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: () => api.get<Campaign[]>("/campaigns"), refetchOnMount: "always" });
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => api.get<Business[]>("/businesses") });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => api.get<SocialAccount[]>("/social/accounts") });
  const [filter, setFilter] = useState<Group | "all">("all");
  const [query, setQuery] = useState("");
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const rows = campaigns.data ?? [];
  const shops = businesses.data ?? [];

  if (campaigns.isLoading || businesses.isLoading || accounts.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <DocumentTitle title="Campaigns" />
        <p className="sr-only">Loading campaigns</p>
        <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200 motion-reduce:animate-none" />
        <div className="h-20 animate-pulse rounded-xl bg-slate-200 motion-reduce:animate-none" />
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

  const grouped = rows.map((c) => ({ c, ...place(c, missingOf(c)) })).sort((a, b) => byUpdated(a.c, b.c));
  const q = query.trim().toLowerCase();
  const visible = grouped.filter(({ c, group }) => {
    if (rows.length > 6 && filter !== "all" && group !== filter) return false;
    if (rows.length > 6 && q) {
      const offer = c.brain?.brief?.offer ?? "";
      return `${c.title} ${productOf(c)} ${offer}`.toLowerCase().includes(q);
    }
    return true;
  });
  const sections: { id: Group; label: string; tint: string }[] = [
    { id: "needs", label: "Needs you", tint: "bg-amber-50 text-amber-800" },
    { id: "going", label: "Going out", tint: "bg-slate-100 text-slate-700" },
    { id: "published", label: "Published", tint: "bg-emerald-50 text-emerald-800" },
  ];
  const upcoming = grouped
    .filter(({ c }) => c.row?.next_at)
    .map(({ c }) => ({ c, at: c.row!.next_at! }))
    .sort((a, b) => a.at.localeCompare(b.at));

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

  return (
    <div className="space-y-6">
      <DocumentTitle title="Campaigns" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        {shops.length === 0
          ? <Link className={primaryLink} to="/businesses/new">Add a business</Link>
          : <Link className={primaryLink} to="/campaigns/new">New campaign</Link>}
      </div>
      <ErrorNote error={error} />
      {rows.length > 6 && (
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "needs", "going", "published"] as const).map((id) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
              className={`rounded-full px-3 py-1 text-sm ${focusCls} ${filter === id ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-700"}`}>
              {id === "all" ? "All" : id === "needs" ? "Needs you" : id === "going" ? "Live" : "Published"}
            </button>
          ))}
          <input aria-label="Search campaigns" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search"
            className={`min-w-[12rem] flex-1 rounded-lg border border-slate-500 bg-white px-3 py-1.5 text-sm ${focusCls}`} />
        </div>
      )}
      {upcoming.length > 0 && (
        <div>
          <p className="text-sm font-medium text-slate-600">Coming up</p>
          <div className="mt-2 flex gap-3 overflow-x-auto">
            {upcoming.map(({ c, at }) => (
              <Link key={c.id} to={`/campaigns/${c.id}`} className={`flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 ${focusCls}`}>
                <Thumb campaign={c} small />
                <span className="text-xs text-slate-700">{whenLabel(at)} · {c.title}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      {rows.length === 0 && (
        <p className="text-sm text-slate-600">
          {shops.length === 0
            ? "Add your business first. Then describe one promotion and LOOPLY drafts it in your customers' language."
            : "No campaigns yet. Describe one promotion and LOOPLY drafts it in your customers' language."}
        </p>
      )}
      {sections.map((section) => {
        const items = visible.filter((item) => item.group === section.id);
        if (!items.length) return null;
        return (
          <section key={section.id} className="space-y-2">
            <h2 className={`rounded-xl px-3 py-2 text-sm font-medium ${section.tint}`}>{section.label} · {items.length}</h2>
            <div className="grid gap-2">
              {items.map(({ c, group, missing, action }) => (
                <CampaignRow key={c.id} campaign={c} group={group} missing={missing} action={action}
                  busy={retrying === c.id} onOpen={() => nav(`/campaigns/${c.id}`)} onRetry={() => retry(c)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function place(c: Campaign, missing: string[]): { group: Group; missing: string[]; action: { label: string; kind: "open" | "again" | "retry" } } {
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

function actionFor(c: Campaign, missing: string[], failed: boolean): { label: string; kind: "open" | "again" | "retry" } {
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

function CampaignRow({ campaign, group, missing, action, busy, onOpen, onRetry }: {
  campaign: Campaign; group: Group; missing: string[]; action: { label: string; kind: "open" | "again" | "retry" };
  busy: boolean; onOpen: () => void; onRetry: () => void;
}) {
  const offer = offerTag(campaign);
  const failed = (campaign.row?.platforms ?? []).some((p) => p.state === "failed");
  const live = group === "going" && campaign.status === "publishing";
  const healthy = group === "published" && !failed && !(campaign.row?.stale_count);
  const used = campaign.brain?.strategy?.platforms ?? [];
  const states = new Map((campaign.row?.platforms ?? []).map((p) => [p.platform, p.state]));
  const line = statusLine(campaign, missing);
  const when = group === "published" && campaign.row?.published_at
    ? publishedLabel(campaign.row.published_at)
    : group === "going" && campaign.row?.next_at ? whenLabel(campaign.row.next_at) : "";
  const stage = journeyIndex(campaign.status);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <Link to={`/campaigns/${campaign.id}`} className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg ${focusCls}`}>
        <Thumb campaign={campaign} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="font-medium">{campaign.title}</p>
            {offer && (
              <p className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs">
                <span className="font-semibold text-brand-700">{offer.figure}</span>
                {offer.rest && <span className="text-slate-600"> {offer.rest}</span>}
              </p>
            )}
          </div>
          <div className="mt-2 flex gap-1" role="img" aria-label={campaign.status === "published" ? "Published" : `Step ${stage + 1} of 4: ${JOURNEY[stage]}`}>
            {JOURNEY.map((label, i) => {
              const done = campaign.status === "published" || i < stage;
              const current = campaign.status !== "published" && i === stage;
              const tone = done ? "bg-emerald-500" : current && (group === "needs" || failed) ? "bg-amber-500" : current ? "bg-brand-700" : "bg-slate-300 dark:bg-slate-600";
              return <span key={label} className={`h-1.5 flex-1 rounded-full ${tone} ${live && current ? "motion-safe:animate-pulse" : ""}`} />;
            })}
          </div>
          {(line && !healthy) && <p className="mt-2 text-xs text-slate-600">{line}</p>}
          {when && <p className="mt-1 text-xs text-slate-600">{when}</p>}
          {!healthy && (used.length > 0 || languagesOf(campaign).length > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              {used.map((p) => (
                <span key={p} className="inline-flex items-center gap-1" title={`${PLATFORM_NAME[p] ?? p}`}>
                  <PlatformGlyph platform={p} />
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClass(states.get(p), missing.includes(p))}`} />
                  <span className="sr-only">{PLATFORM_NAME[p] ?? p}, {states.get(p) ?? (missing.includes(p) ? "not connected" : "included")}</span>
                </span>
              ))}
              {languagesOf(campaign).length > 0 && (
                <span>{languagesOf(campaign).map((l) => NATIVE[l] ?? LANGUAGES[l] ?? l).join(" ")}</span>
              )}
            </div>
          )}
        </div>
      </Link>
      {action.kind === "again" && (
        <Link to={`/campaigns/new?from=${campaign.id}`} className={actionCls}>Run again</Link>
      )}
      {action.kind === "retry" && (
        <button type="button" className={actionCls} disabled={busy} onClick={onRetry}>{busy ? "Retrying…" : "Retry"}</button>
      )}
      {action.kind === "open" && (
        <button type="button" className={actionCls} onClick={onOpen}>{action.label}</button>
      )}
    </div>
  );
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

function Thumb({ campaign, small = false }: { campaign: Campaign; small?: boolean }) {
  const size = small ? "h-8 w-8" : "h-14 w-14";
  const url = campaign.row?.poster_url;
  if (url) return <img src={url} alt="" className={`${size} shrink-0 rounded-xl bg-slate-100 object-cover`} />;
  const letter = (campaign.title.trim()[0] || "?").toUpperCase();
  const tint = TINTS[letter.charCodeAt(0) % TINTS.length];
  return <span aria-hidden="true" className={`${size} inline-flex shrink-0 items-center justify-center rounded-xl text-lg font-semibold ${tint}`}>{letter}</span>;
}

function PlatformGlyph({ platform }: { platform: string }) {
  const paths: Record<string, string> = {
    instagram: "M4 2.5h8A1.5 1.5 0 0 1 13.5 4v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12V4A1.5 1.5 0 0 1 4 2.5z M8 5.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z",
    whatsapp: "M8 2.2a5.8 5.8 0 0 0-5 8.7L2.2 13.8l3-0.8A5.8 5.8 0 1 0 8 2.2z",
    facebook: "M9 13.5V8.6h1.6l.3-1.8H9V5.7c0-.5.2-.9.9-.9H11V3.1C10.8 3.1 10.2 3 9.5 3 8 3 7 3.9 7 5.5v1.3H5.4v1.8H7v4.9H9z",
    linkedin: "M3.2 6.2h2.1V13H3.2z M4.2 3.1a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z M6.8 6.2h2v7H6.8z",
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5">
      <path d={paths[platform] ?? "M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z"} fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
