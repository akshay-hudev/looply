import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { api } from "../lib/api";
import { displayOffer } from "../lib/offer";
import { Asset, Brief, Business, Campaign, LANGUAGES, Learning, Me, Offer, PLATFORMS, SocialAccount } from "../lib/types";
import { Badge, Button, Card, DocumentTitle, ErrorNote, focusCls, statusLabel, statusTone } from "../lib/ui";

const WAITING = new Set(["clarifying", "strategy_review", "review"]);
const IST = 5.5 * 60 * 60 * 1000;
const WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const PLATFORM_NAME: Record<string, string> = {
  instagram: "Instagram", whatsapp: "WhatsApp", facebook: "Facebook", linkedin: "LinkedIn",
};

function offerLine(brief?: Brief, offer?: Offer): string {
  const typed = brief?.offer?.trim();
  if (typed) return displayOffer(typed);
  const parts = [offer?.discount, offer?.price].filter(Boolean);
  if (parts.length) return displayOffer(parts.join(" · "));
  return "No price or deal. We won't invent one.";
}
function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function byCreated(a: Campaign, b: Campaign) {
  return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}
function byUpdated(a: Campaign, b: Campaign) {
  const au = a.updated_at || a.created_at;
  const bu = b.updated_at || b.created_at;
  return au.localeCompare(bu) || byCreated(a, b);
}
function locked(c: Campaign) {
  const brief = c.brain?.brief;
  const langs = c.brain?.strategy?.languages ?? [];
  return !!(brief?.product || brief?.offer || brief?.region || brief?.audience || langs.length);
}
function productOf(c: Campaign) {
  return c.brain?.brief?.product?.trim() || c.brain?.offer?.product || c.title;
}
function featureCopy(c: Campaign, shopName: string, missingAccount: boolean): { eyebrow: string; step: string } {
  const product = productOf(c);
  if (c.status === "strategy_review") return { eyebrow: "Waiting on you", step: `Check the plan for ${shopName}` };
  if (c.status === "review") return { eyebrow: "Waiting on you", step: `Approve ${product}` };
  if (c.status === "clarifying") return { eyebrow: "Waiting on you", step: `Answer a question about ${product}` };
  if (c.status === "generating") return { eyebrow: "In progress", step: `Open ${product}` };
  if (c.status === "publishing") return { eyebrow: "Publishing", step: `Open ${product}` };
  if (c.status === "approved") return { eyebrow: missingAccount ? "Needs an account" : "Ready to publish", step: `Open ${product}` };
  if (c.status === "published") return { eyebrow: "Published", step: `Open ${product}` };
  return { eyebrow: statusLabel(c.status), step: `Open ${product}` };
}
function languagesOf(c: Campaign) {
  return c.brain?.strategy?.languages?.length
    ? c.brain.strategy.languages
    : c.brain?.requested_languages ?? [];
}

function istParts(at = new Date()) {
  const wall = new Date(at.getTime() + IST);
  return { dow: wall.getUTCDay(), h: wall.getUTCHours(), m: wall.getUTCMinutes(), y: wall.getUTCFullYear(), month: wall.getUTCMonth(), d: wall.getUTCDate() };
}
function parseClock(raw: string): { h: number; m: number } | null {
  const t = raw.trim().toLowerCase();
  const hm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) return { h: Number(hm[1]), m: Number(hm[2]) };
  const ap = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!ap) return null;
  let h = Number(ap[1]);
  const m = Number(ap[2] ?? 0);
  if (ap[3] === "pm" && h < 12) h += 12;
  if (ap[3] === "am" && h === 12) h = 0;
  return { h, m };
}
function clockLabel(h: number, m: number) {
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}
function nextSlot(day: string, time: string): { at: Date; delta: number; label: string } | null {
  const dow = WEEK.indexOf(day.trim().toLowerCase());
  const clock = parseClock(time);
  if (dow < 0 || !clock) return null;
  const now = istParts();
  let delta = (dow - now.dow + 7) % 7;
  if (delta === 0 && (clock.h < now.h || (clock.h === now.h && clock.m <= now.m))) delta = 7;
  const at = new Date(Date.UTC(now.y, now.month, now.d + delta, clock.h, clock.m) - IST);
  const timeText = clockLabel(clock.h, clock.m);
  const label = delta < 7
    ? `${cap(WEEK[dow])} ${timeText}`
    : `${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(at)} ${timeText}`;
  return { at, delta, label };
}

const primaryLink = `inline-flex items-center rounded-lg bg-brand-700 px-4 py-2 font-medium text-white hover:bg-brand-800 ${focusCls}`;
const ghostLink = `inline-flex items-center rounded-lg border border-slate-500 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 ${focusCls}`;

export default function Dashboard() {
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: () => api.get<Campaign[]>("/campaigns"), refetchOnMount: "always" });
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => api.get<Business[]>("/businesses") });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => api.get<SocialAccount[]>("/social/accounts") });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/auth/me") });
  const rows = campaigns.data ?? [];
  const shops = businesses.data ?? [];
  const names = new Map(shops.map((b) => [b.id, b]));
  const latest = [...rows].sort((a, b) => -byUpdated(a, b))[0];
  const shop = latest ? names.get(latest.business_id) : shops.length === 1 ? shops[0] : undefined;
  const learningCandidate = shop?.learnings?.[shop.learnings.length - 1];
  const learningSource = rows.find((c) => c.id === learningCandidate?.campaign_id);
  const needSimulated = !!learningCandidate?.id && !!learningCandidate.campaign_id
    && learningSource?.status === "published" && typeof learningCandidate.simulated !== "boolean";
  const analytics = useQuery({
    queryKey: ["analytics", learningCandidate?.campaign_id],
    enabled: needSimulated,
    queryFn: () => api.get<{ rows: { simulated: boolean }[] }>(`/campaigns/${learningCandidate?.campaign_id}/analytics`),
  });
  const accountReady = (platform: string, businessId: string) =>
    (accounts.data ?? []).some((a) => a.target_platform === platform && (!a.business_id || a.business_id === businessId));
  const featuredId = latest?.id;
  const detail = useQuery({
    queryKey: ["campaign", featuredId],
    enabled: !!featuredId,
    queryFn: () => api.get<Campaign>(`/campaigns/${featuredId}`),
  });

  const loading = campaigns.isLoading || businesses.isLoading || accounts.isLoading || me.isLoading || (needSimulated && analytics.isLoading);
  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <DocumentTitle title="LocalMind" />
        <p className="sr-only">Loading your shop</p>
        <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200 motion-reduce:animate-none" />
        <div className="h-28 animate-pulse rounded-xl bg-slate-200 motion-reduce:animate-none" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-20 animate-pulse rounded-xl bg-slate-200 motion-reduce:animate-none" />
          <div className="h-20 animate-pulse rounded-xl bg-slate-200 motion-reduce:animate-none" />
        </div>
      </div>
    );
  }
  if (campaigns.isError || businesses.isError) {
    return (
      <div className="space-y-2">
        <DocumentTitle title="LocalMind" />
        <ErrorNote error={new Error("Couldn't load this. Try again.")} />
        <Button onClick={() => { campaigns.refetch(); businesses.refetch(); }}>Try again</Button>
      </div>
    );
  }

  const title = shop?.name ?? "Campaigns";
  const placeLine = [shop?.category, shop?.city].filter(Boolean).join(" · ");
  const hasCampaigns = rows.length > 0;
  const welcome = hasCampaigns && me.data?.name
    ? `Welcome back, ${me.data.name}`
    : hasCampaigns && shop ? shop.name : "";

  const waiting = rows.filter((c) => WAITING.has(c.status));
  const featured = latest;
  const featuredShop = featured ? names.get(featured.business_id)?.name || shop?.name || "your shop" : "";
  const missingAccount = !!featured && featured.status === "approved"
    && (featured.brain?.strategy?.platforms ?? []).some((p) => !accountReady(p, featured.business_id));
  const feature = featured ? featureCopy(featured, featuredShop, missingAccount) : null;

  const readyCount = rows.filter((c) => {
    if (c.status !== "approved") return false;
    const platforms = c.brain?.strategy?.platforms ?? [];
    return platforms.length > 0 && platforms.every((p) => accountReady(p, c.business_id));
  }).length;
  const countLine = [
    [shops.length, "shop", "shops"],
    [rows.filter((c) => c.status === "published").length, "published", "published"],
    [readyCount, "ready to publish", "ready to publish"],
    [waiting.length, "waiting on you", "waiting on you"],
    [rows.filter((c) => c.status === "generating" || c.status === "publishing").length, "in progress", "in progress"],
  ].filter(([n]) => Number(n) > 0).map(([n, one, many]) => `${n} ${Number(n) === 1 ? one : many}`).join(" · ");

  const approved = rows.filter((c) => c.status === "approved");
  const heroWhen = featured && featured.status === "approved" ? soonestPost([featured], accountReady) : null;
  const otherWhen = soonestPost(approved.filter((c) => c.id !== featured?.id), accountReady);
  const pastOffers = [...rows]
    .filter((c) => shop && c.business_id === shop.id && locked(c) && !WAITING.has(c.status) && c.id !== featured?.id && offerLabel(c))
    .sort((a, b) => -byUpdated(a, b))
    .slice(0, 3);
  const learning = pickLearning(shop, rows);
  const quiet = [
    pastOffers.length > 0 && shop ? "offers" as const : null,
    learning ? "learning" as const : null,
    otherWhen ? "when" as const : null,
  ].filter((item): item is "offers" | "learning" | "when" => !!item).slice(0, 3);
  const recent = [...rows].sort((a, b) => -byUpdated(a, b)).slice(0, 3);
  const invite = shops.length === 0
    ? "Add your business first. Then describe one promotion and LocalMind drafts it in your customers' language."
    : shops.length === 1
      ? `Describe a promotion for ${shops[0].name}. LocalMind will draft it in the languages you pick.`
      : "No campaigns yet. Describe one promotion and LocalMind drafts it in your customers' language.";

  const hero = !!featured || !hasCampaigns;

  return (
    <div className="space-y-6">
      <DocumentTitle title={title} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {welcome && <p className="text-sm text-slate-600">{welcome}</p>}
          <h1 className="text-2xl font-bold">{title}</h1>
          {placeLine && <p className="text-sm text-slate-600">{placeLine}</p>}
          {countLine && <p className="mt-2 text-sm text-slate-600">{countLine}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {feature && featured
            ? <Link className={primaryLink} to={`/campaigns/${featured.id}`}>{feature.step}</Link>
            : shops.length === 0
              ? <Link className={primaryLink} to="/businesses/new">Add a business</Link>
              : <Link className={primaryLink} to="/campaigns/new">New campaign</Link>}
          {feature && shops.length > 0 && <Link className={ghostLink} to="/campaigns/new">New campaign</Link>}
        </div>
      </div>

      {hero && (
        <div>
          {featured && feature && (
            <WaitingCard
              campaign={detail.data?.id === featured.id ? detail.data : featured}
              shopName={featuredShop}
              step={feature.step}
              href={`/campaigns/${featured.id}`}
              eyebrow={feature.eyebrow}
              goesOut={heroWhen ? `${heroWhen.channel} · ${heroWhen.label}` : undefined}
              connected={(platform) => accountReady(platform, featured.business_id)}
            />
          )}
          {!hasCampaigns && <p className="text-sm text-slate-600">{invite}</p>}
        </div>
      )}

      {quiet.length > 0 && (
        <div className="flex flex-wrap gap-4">
          {quiet.map((kind) => {
            if (kind === "offers" && shop) {
              return (
                <div key="offers" className="min-w-[16rem] flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="font-semibold">Another promotion for {shop.name}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {pastOffers.map((c) => (
                      <Link key={c.id} to={`/campaigns/new?from=${c.id}`} className={`rounded-full ${focusCls}`}>
                        <Badge>{offerLabel(c)}</Badge>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            }
            if (kind === "learning" && learning) {
              return (
                <Link key="learning" to={`/campaigns/new?learning=${learning.id}`} className={`block min-w-[16rem] flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-500 ${focusCls}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">Use this next time</p>
                    {learning.simulated && <Badge tone="amber">Simulated</Badge>}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{learning.recommendation || learning.insight}</p>
                </Link>
              );
            }
            if (kind === "when" && otherWhen) {
              return (
                <Link key="when" to={`/campaigns/${otherWhen.id}`} className={`block min-w-[16rem] flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-500 ${focusCls}`}>
                  <p className="text-sm font-medium">When it goes out</p>
                  <p className="mt-2 text-sm text-slate-600">{otherWhen.product} · {otherWhen.channel} · {otherWhen.label}</p>
                </Link>
              );
            }
            return null;
          })}
        </div>
      )}

      {hasCampaigns && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Recent campaigns</h2>
            <Link to="/campaigns" className={`text-sm font-medium text-brand-700 ${focusCls}`}>All campaigns</Link>
          </div>
          <div className="grid gap-3">
            {recent.map((c) => {
              const missing = c.status === "approved" && (c.brain?.strategy?.platforms ?? []).some((p) => !accountReady(p, c.business_id));
              return (
                <Link key={c.id} to={`/campaigns/${c.id}`}>
                  <Card className="flex items-center justify-between gap-3 hover:border-brand-500">
                    <div>
                      <div className="font-medium">{c.title}</div>
                      <div className="text-xs text-slate-600">
                        {[names.get(c.business_id)?.name, offerLine(c.brain?.brief, c.brain?.offer)].filter(Boolean).join(" · ")}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(c.brain?.strategy?.platforms ?? []).map((p) => <Badge key={p}>{cap(p)}</Badge>)}
                        {languagesOf(c).map((l) => <Badge key={l}>{LANGUAGES[l] ?? l}</Badge>)}
                      </div>
                    </div>
                    <Badge tone={missing ? "amber" : statusTone(c.status)}>{missing ? "Needs an account" : statusLabel(c.status)}</Badge>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

const JOURNEY = ["Plan", "Your posts", "Approve", "Publish"];

function journeyIndex(status: string) {
  if (status === "generating") return 1;
  if (status === "review") return 2;
  if (status === "approved" || status === "publishing" || status === "published") return 3;
  return 0;
}

function formatWhen(raw?: string | null) {
  if (!raw) return "";
  const iso = raw.length === 10 ? `${raw}T00:00:00+05:30` : raw;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return raw;
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" }).format(at);
}

function offerLabel(c: Campaign): string {
  return displayOffer(c.brain?.brief?.offer?.trim() || c.brain?.offer?.discount?.trim() || c.brain?.offer?.price?.trim() || "");
}

function soonestPost(campaigns: Campaign[], ready: (platform: string, businessId: string) => boolean) {
  let best: { at: Date; id: string; product: string; channel: string; label: string } | null = null;
  for (const c of campaigns) {
    const platforms = c.brain?.strategy?.platforms ?? [];
    for (const slot of c.brain?.strategy?.posting_schedule ?? []) {
      if (!platforms.includes(slot.platform) || !ready(slot.platform, c.business_id)) continue;
      const when = nextSlot(slot.day, slot.time);
      if (!when || (best && when.at >= best.at)) continue;
      best = {
        at: when.at, id: c.id, product: productOf(c),
        channel: PLATFORM_NAME[slot.platform] ?? cap(slot.platform), label: when.label,
      };
    }
  }
  return best;
}

function offerParts(c: Campaign) {
  const offer = c.brain?.offer;
  const brief = c.brain?.brief;
  const typed = displayOffer(brief?.offer?.trim() || "");
  const figure = displayOffer(offer?.discount?.trim() || offer?.price?.trim() || typed);
  if (!figure) return null;
  let condition = "";
  if (typed && typed !== figure) condition = typed.replace(figure, "").replace(/^[\s,·\-–]+/, "").trim();
  else if (!typed) condition = offer?.duration_text?.trim() || "";
  const start = offer?.start_date || brief?.event_date;
  const end = offer?.end_date;
  const dates = start && end && start !== end ? `${formatWhen(start)} – ${formatWhen(end)}` : formatWhen(start);
  return { figure, condition, dates };
}

function cellFor(platform: string, language: string, campaign: Campaign, assets: Asset[] | undefined, isConnected: boolean, used: boolean) {
  if (!isConnected) return { word: "Not connected", tone: "amber" as const, mark: "miss" as const };
  if (!used) return { word: "Connected", tone: "green" as const, mark: "on" as const };
  const mine = (assets ?? []).filter((a) => a.platform === platform && a.language === language && a.is_selected);
  if (mine.some((a) => a.status === "failed" || a.verification?.status === "failed")) return { word: "Failed", tone: "red" as const, mark: "fail" as const };
  if (mine.some((a) => ["verified", "approved"].includes(a.status) || a.verification?.status === "verified")) return { word: "Ready", tone: "green" as const, mark: "ready" as const };
  if (campaign.status === "generating") return { word: "Writing", tone: "blue" as const, mark: "wait" as const };
  if (campaign.status === "review") return { word: "Needs approval", tone: "blue" as const, mark: "wait" as const };
  if (campaign.status === "clarifying") return { word: "Needs an answer", tone: "amber" as const, mark: "wait" as const };
  return { word: "Needs a plan", tone: "blue" as const, mark: "wait" as const };
}

function Mark({ kind }: { kind: "ready" | "wait" | "fail" | "miss" | "on" }) {
  if (kind === "on") {
    return (
      <svg aria-hidden="true" viewBox="0 0 10 10" className="h-3 w-3 shrink-0">
        <circle cx="5" cy="5" r="2.2" fill="currentColor" />
      </svg>
    );
  }
  const d = {
    ready: "M1.5 5.2 3.4 7.1 8.5 2.2",
    fail: "M2 2 l6 6 M8 2 l-6 6",
    miss: "M5 1.5 v4 M5 7.5 v.6",
    wait: "M5 2.2 v3.2 l2 1.2",
  }[kind];
  return (
    <svg aria-hidden="true" viewBox="0 0 10 10" className="h-3 w-3 shrink-0">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NATIVE: Record<string, string> = {
  en: "EN", hi: "हिन्दी", kn: "ಕನ್ನಡ", ta: "தமிழ்", te: "తెలుగు", mr: "मराठी", bn: "বাংলা",
  ml: "മലയാളം", gu: "ગુજરાતી", pa: "ਪੰਜਾਬੀ", ur: "اردو", es: "ES", fr: "FR", ar: "العربية", pt: "PT", id: "ID",
};

function shortLang(code: string) {
  return NATIVE[code] ?? LANGUAGES[code] ?? code;
}

function WaitingCard({ campaign, shopName, step, href, eyebrow = "Waiting on you", goesOut, connected }: {
  campaign: Campaign; shopName: string; step: string; href: string; eyebrow?: string; goesOut?: string;
  connected: (platform: string) => boolean;
}) {
  const used = new Set(campaign.brain?.strategy?.platforms ?? []);
  const platforms = [...PLATFORMS];
  const languages = languagesOf(campaign);
  const offer = offerParts(campaign);
  const stage = journeyIndex(campaign.status);
  const posters = (campaign.assets ?? []).filter((a) => a.is_selected && a.media_url).slice(0, 4);
  const heroPoster = posters[0];
  const posterLangs = [...new Set(posters.map((a) => a.language))];
  const cells = platforms.flatMap((p) => languages.map((l) => ({ p, l, ...cellFor(p, l, campaign, campaign.assets, connected(p), used.has(p)) })));
  const columns = `minmax(9rem, auto) repeat(${Math.max(languages.length, 1)}, 2.5rem)`;

  return (
    <Link to={href} className={`block rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-500 ${focusCls}`}>
      <div className={heroPoster ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]" : ""}>
        <div>
          <p className="flex items-center gap-2 text-sm text-slate-600">
            {eyebrow === "Needs an account" && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" />}
            {eyebrow}
          </p>
          <p className="text-2xl font-semibold">{campaign.title} <span className="font-normal text-slate-600">· {shopName}</span></p>
          {offer && <OfferStrip figure={offer.figure} condition={offer.condition} dates={offer.dates} />}
          {platforms.length > 0 && languages.length > 0 && (
            <div className="mt-5 grid items-center gap-x-3 gap-y-2" style={{ gridTemplateColumns: columns }}>
              <span />
              {languages.map((l) => (
                <span key={l} className="text-center text-xs text-slate-600">{shortLang(l)}</span>
              ))}
              {platforms.map((p) => {
                const name = PLATFORM_NAME[p] ?? cap(p);
                const missed = languages.every((l) => cells.find((c) => c.p === p && c.l === l)?.word === "Not connected");
                return (
                  <div key={p} className={`col-span-full grid items-center gap-x-3 rounded-xl px-3 py-2 ${missed ? "bg-amber-50" : "bg-slate-100"}`} style={{ gridTemplateColumns: columns }}>
                    <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <PlatformGlyph platform={p} />
                      {name}
                    </span>
                    {languages.map((l) => {
                      const cell = cells.find((c) => c.p === p && c.l === l)!;
                      return <StatusMark key={l} kind={cell.mark} label={`${name}, ${LANGUAGES[l] ?? l}, ${cell.word}`} />;
                    })}
                  </div>
                );
              })}
            </div>
          )}
          <ol aria-label={`Step ${stage + 1} of ${JOURNEY.length}: ${JOURNEY[stage]}`} className="mt-5">
            <div aria-hidden="true" className="flex gap-1">
              {JOURNEY.map((label, i) => (
                <span key={label} className={`h-1.5 flex-1 rounded-full ${i < stage ? "bg-emerald-500" : i === stage ? "bg-brand-700" : "bg-slate-300 dark:bg-slate-600"}`} />
              ))}
            </div>
            <div className="mt-2 flex gap-1">
              {JOURNEY.map((label, i) => (
                <span key={label} className={`flex-1 text-xs ${i === stage ? "font-semibold text-brand-700" : i < stage ? "text-emerald-800" : "text-slate-500"}`}>
                  {i < stage ? "✓ " : i === stage ? `${i + 1} ` : ""}{label}
                </span>
              ))}
            </div>
          </ol>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
            {goesOut
              ? <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"><ClockIcon />{goesOut}</span>
              : <span />}
            <p className="text-sm font-semibold text-brand-700">{step} →</p>
          </div>
        </div>
        {heroPoster && (
          <div>
            <img src={heroPoster.media_url!} alt={`${PLATFORM_NAME[heroPoster.platform] ?? cap(heroPoster.platform)}, ${LANGUAGES[heroPoster.language] ?? heroPoster.language}`} className="aspect-[3/4] w-full rounded-xl bg-slate-100 object-cover" />
            {posterLangs.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {posterLangs.map((l) => <span key={l} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{LANGUAGES[l] ?? l}</span>)}
              </div>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

function OfferStrip({ figure, condition, dates }: { figure: string; condition: string; dates: string }) {
  const percent = figure.match(/^(\d{1,3}(?:\.\d+)?)%$/);
  const conditionText = percent ? condition.replace(/^off\b[\s,·\-–]*/i, "").trim() : condition;
  return (
    <div className="mt-4 inline-flex max-w-full flex-wrap items-center gap-x-8 gap-y-2 rounded-xl bg-slate-100 px-4 py-3">
      <p className={percent ? "inline-flex items-baseline gap-2" : figure.length > 12 ? "text-lg font-semibold text-slate-900" : "text-3xl font-semibold text-slate-900"}>
        {percent
          ? <><span className="text-4xl font-semibold text-brand-700">{percent[1]}%</span><span className="text-sm font-medium text-slate-600">off</span></>
          : figure}
      </p>
      {conditionText && <p className="text-sm font-medium text-slate-900">{conditionText}</p>}
      {dates && (
        <p className="text-sm text-slate-600">
          <span className="block text-xs">On</span>
          <span className="font-medium text-slate-900">{dates}</span>
        </p>
      )}
    </div>
  );
}

function StatusMark({ kind, label }: { kind: "ready" | "wait" | "fail" | "miss" | "on"; label: string }) {
  const tone = {
    ready: "bg-emerald-600 text-white",
    on: "bg-emerald-700 text-white",
    miss: "bg-amber-600 text-white",
    fail: "bg-red-600 text-white",
    wait: "bg-sky-700 text-white",
  }[kind];
  return (
    <span role="img" title={label} aria-label={label} className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full ${tone}`}>
      <Mark kind={kind} />
    </span>
  );
}

function PlatformGlyph({ platform }: { platform: string }) {
  const paths: Record<string, string> = {
    instagram: "M4 2.5h8A1.5 1.5 0 0 1 13.5 4v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12V4A1.5 1.5 0 0 1 4 2.5z M8 5.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z M11.6 4.5h.1",
    whatsapp: "M8 2.2a5.8 5.8 0 0 0-5 8.7L2.2 13.8l3-0.8A5.8 5.8 0 1 0 8 2.2z",
    facebook: "M9 13.5V8.6h1.6l.3-1.8H9V5.7c0-.5.2-.9.9-.9H11V3.1C10.8 3.1 10.2 3 9.5 3 8 3 7 3.9 7 5.5v1.3H5.4v1.8H7v4.9H9z",
    linkedin: "M3.2 6.2h2.1V13H3.2z M4.2 3.1a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z M6.8 6.2H8.8v.9c.3-.5.9-1 2-1 1.8 0 2.4 1.1 2.4 2.8V13H11.2V9.2c0-.8-.3-1.4-1.1-1.4s-1.2.6-1.2 1.5V13H6.8V6.2z",
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
      <path d={paths[platform] ?? "M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z"} fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5">
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 5v3.2l2 1.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function pickLearning(shop: Business | undefined, rows: Campaign[]): Learning | null {
  const list = shop?.learnings ?? [];
  const newest = list[list.length - 1];
  if (!newest?.campaign_id || !newest.id) return null;
  const source = rows.find((c) => c.id === newest.campaign_id);
  if (!source || source.status !== "published") return null;
  if (typeof newest.simulated !== "boolean") return null;
  return newest;
}
