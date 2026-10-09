import { useQuery } from "@tanstack/react-query";
import { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AmplifyBeams, NATIVE_LANGUAGE } from "../components/AmplifyBeams";
import { Aurora, BorderBeam, Img, LOOP_GRADIENT, NumberTicker, PostStack, PosterFallback, Reveal } from "../components/fx";
import { OfferStrip, offerParts } from "../components/Offer";
import { PlatformIcon } from "../components/PlatformIcon";

import { api } from "../lib/api";
import { displayOffer } from "../lib/offer";
import { Asset, Brief, Business, Campaign, LANGUAGES, Learning, Me, Offer, PLATFORMS, SocialAccount } from "../lib/types";
import { Badge, Button, DocumentTitle, ErrorNote, focusCls, statusLabel, statusTone } from "../lib/ui";

const WAITING = new Set(["clarifying", "strategy_review", "review"]);
const IST = 5.5 * 60 * 60 * 1000;
const WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const PLATFORM_NAME: Record<string, string> = {
  instagram: "Instagram", whatsapp: "WhatsApp", facebook: "Facebook", linkedin: "LinkedIn", youtube: "YouTube", x: "X",
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

const primaryLink = `lm-cta inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white ${focusCls}`;
const ghostLink = `lm-glass inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-slate-800 transition-colors hover:bg-white/90 dark:hover:bg-white/10 ${focusCls}`;

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
        <DocumentTitle title="LOOPLY" />
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
        <DocumentTitle title="LOOPLY" />
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
  const stats = [
    { n: rows.filter((c) => c.status === "published").length, label: "Published" },
    { n: readyCount, label: "Ready to publish" },
    { n: waiting.length, label: "Waiting on you", hot: waiting.length > 0 },
    { n: rows.filter((c) => c.status === "generating" || c.status === "publishing").length, label: "In progress" },
  ];

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
    ? "Add your business first. Then describe one promotion and LOOPLY drafts it in your customers' language."
    : shops.length === 1
      ? `Describe a promotion for ${shops[0].name}. LOOPLY will draft it in the languages you pick.`
      : "No campaigns yet. Describe one promotion and LOOPLY drafts it in your customers' language.";

  const heroCampaign = featured && detail.data?.id === featured.id ? detail.data : featured;
  const heroOffer = heroCampaign ? offerParts(heroCampaign) : null;
  const heroFigure = heroOffer?.figure || (heroCampaign ? productOf(heroCampaign) : "Your offer");
  const heroCaption = heroCampaign
    ? [heroOffer?.figure ? productOf(heroCampaign) : "", heroOffer?.dates].filter(Boolean).join(" · ")
    : "Say it once. We take it everywhere.";
  const heroPlatforms = heroCampaign ? heroCampaign.brain?.strategy?.platforms ?? [] : [...PLATFORMS];
  const heroLanguages = heroCampaign ? languagesOf(heroCampaign) : ["en", "hi", "kn"];
  const needsYou = !!feature && (feature.eyebrow === "Waiting on you" || feature.eyebrow === "Needs an account");

  return (
    <div className="space-y-10">
      <DocumentTitle title={title} />

      <section className="lm-card relative overflow-hidden rounded-3xl border bg-white">
        <Aurora />
        <div className="relative grid items-center gap-10 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
          <Reveal>
            {welcome && (
              <p className="lm-glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-slate-700">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />{welcome}
              </p>
            )}
            <h1 className="mt-4 font-display text-5xl leading-[0.95] tracking-tight text-slate-900 sm:text-6xl">{title}</h1>
            {placeLine && <p className="mt-2 text-sm font-medium text-slate-600">{placeLine}</p>}
            <p className="mt-5 max-w-md font-display text-2xl leading-snug text-slate-800">
              Say it once. <em className="lm-gradient-text pr-1">Amplified</em> everywhere your customers are.
            </p>
            {hasCampaigns ? (
              <dl className="mt-6 grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-4">
                {stats.map((s) => (
                  <div key={s.label} className={`lm-glass rounded-2xl px-3 py-2.5 ${s.hot ? "ring-2 ring-brand-300" : ""}`}>
                    <dt className="text-[11px] font-medium text-slate-600">{s.label}</dt>
                    <dd className={`mt-0.5 font-display text-4xl leading-none ${s.hot ? "lm-gradient-text" : "text-slate-900"}`}><NumberTicker value={s.n} /></dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-4 max-w-md text-sm text-slate-600">{invite}</p>
            )}
            <div className="mt-7 flex flex-wrap gap-3">
              {feature && featured
                ? <Link className={primaryLink} to={`/campaigns/${featured.id}`}>{feature.step}<ArrowIcon /></Link>
                : shops.length === 0
                  ? <Link className={primaryLink} to="/businesses/new">Add a business<ArrowIcon /></Link>
                  : <Link className={primaryLink} to="/campaigns/new">New campaign<ArrowIcon /></Link>}
              {feature && shops.length > 0 && <Link className={ghostLink} to="/campaigns/new"><PlusIcon />New campaign</Link>}
            </div>
          </Reveal>
          <AmplifyBeams figure={heroFigure} caption={heroCaption} platforms={heroPlatforms} languages={heroLanguages}
            eyebrow={heroCampaign ? "Latest offer" : "Your offer"} />
        </div>
      </section>

      {featured && feature && (
        <Reveal delay={0.1} className="space-y-3">
          <SectionHead eyebrow={needsYou ? "Needs you now" : "Latest campaign"} title={feature.eyebrow === "Waiting on you" ? "One step left from you" : feature.eyebrow} />
          <WaitingCard
            campaign={detail.data?.id === featured.id ? detail.data : featured}
            shopName={featuredShop}
            step={feature.step}
            href={`/campaigns/${featured.id}`}
            eyebrow={feature.eyebrow}
            highlight={needsYou}
            goesOut={heroWhen ? `${heroWhen.channel} · ${heroWhen.label}` : undefined}
            connected={(platform) => accountReady(platform, featured.business_id)}
          />
        </Reveal>
      )}

      {quiet.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quiet.map((kind) => {
            if (kind === "offers" && shop) {
              return (
                <div key="offers" className="lm-card rounded-2xl border bg-white p-5">
                  <IconTile><TagIcon /></IconTile>
                  <p className="mt-3 font-display text-xl leading-tight">Another promotion for {shop.name}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {pastOffers.map((c) => (
                      <Link key={c.id} to={`/campaigns/new?from=${c.id}`} className={`rounded-full ${focusCls}`}>
                        <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100">{offerLabel(c)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            }
            if (kind === "learning" && learning) {
              return (
                <Link key="learning" to={`/campaigns/new?learning=${learning.id}`} className={`lm-card block rounded-2xl border bg-white p-5 transition-transform duration-300 hover:-translate-y-0.5 ${focusCls}`}>
                  <div className="flex items-start justify-between gap-2">
                    <IconTile><BulbIcon /></IconTile>
                    {learning.simulated && <Badge tone="amber">Simulated</Badge>}
                  </div>
                  <p className="mt-3 font-display text-xl leading-tight">Use this next time</p>
                  <p className="mt-1 text-sm text-slate-600">{learning.recommendation || learning.insight}</p>
                </Link>
              );
            }
            if (kind === "when" && otherWhen) {
              return (
                <Link key="when" to={`/campaigns/${otherWhen.id}`} className={`lm-card block rounded-2xl border bg-white p-5 transition-transform duration-300 hover:-translate-y-0.5 ${focusCls}`}>
                  <IconTile><ClockIcon /></IconTile>
                  <p className="mt-3 font-display text-xl leading-tight">When it goes out</p>
                  <p className="mt-1 text-sm text-slate-600">{otherWhen.product} · {otherWhen.channel} · {otherWhen.label}</p>
                </Link>
              );
            }
            return null;
          })}
        </div>
      )}

      {hasCampaigns && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <SectionHead eyebrow="Your work" title="Recent campaigns" />
            <Link to="/campaigns" className={`text-sm font-semibold text-brand-700 ${focusCls}`}>All campaigns →</Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((c, i) => {
              const missing = c.status === "approved" && (c.brain?.strategy?.platforms ?? []).some((p) => !accountReady(p, c.business_id));
              const poster = c.row?.poster_url;
              const figure = offerLabel(c) || productOf(c);
              return (
                <Reveal key={c.id} delay={0.05 * i}>
                  <Link to={`/campaigns/${c.id}`} className={`lm-card group block h-full overflow-hidden rounded-2xl border bg-white transition duration-300 hover:-translate-y-1 hover:shadow-xl ${focusCls}`}>
                    <div className="relative aspect-[16/10] overflow-hidden" style={{ backgroundImage: LOOP_GRADIENT }}>
                      <Img src={poster ?? undefined} alt="" aria-hidden="true" fallback={null}
                        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-xl" />
                      <Img src={poster ?? undefined} alt={`Poster for ${c.title}`}
                        className="relative h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.04]"
                        fallback={(
                          <div className="flex h-full items-center justify-center p-4 text-center">
                            <span className="font-display text-4xl leading-none text-[#ffffff]">{figure}</span>
                          </div>
                        )} />
                      <span className="absolute right-3 top-3">
                        <Badge tone={missing ? "amber" : statusTone(c.status)}>{missing ? "Needs an account" : statusLabel(c.status)}</Badge>
                      </span>
                    </div>
                    <div className="space-y-2 p-4">
                      <p className="line-clamp-2 font-display text-2xl leading-tight text-slate-900">{c.title}</p>
                      <p className="line-clamp-1 text-xs text-slate-600">
                        {[names.get(c.business_id)?.name, offerLine(c.brain?.brief, c.brain?.offer)].filter(Boolean).join(" · ")}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="flex items-center gap-1.5">
                          {(c.brain?.strategy?.platforms ?? []).map((p) => <PlatformIcon key={p} platform={p} className="h-4 w-4 text-slate-900" />)}
                        </span>
                        <span className="ml-auto text-xs text-slate-600">{languagesOf(c).map((l) => NATIVE_LANGUAGE[l] ?? LANGUAGES[l] ?? l).join(" · ")}</span>
                      </div>
                    </div>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">{eyebrow}</p>
      <h2 className="font-display text-3xl leading-tight text-slate-900">{title}</h2>
    </div>
  );
}

function IconTile({ children }: { children: ReactNode }) {
  return <span className="flex h-10 w-10 items-center justify-center rounded-xl text-[#ffffff] shadow-sm" style={{ backgroundImage: LOOP_GRADIENT }}>{children}</span>;
}

function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function PlusIcon() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}
function TagIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5"><path d="M3 10.5V4a1 1 0 0 1 1-1h6.5L17 9.5 10.5 16z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><circle cx="7" cy="7" r="1.3" fill="currentColor" /></svg>;
}
function BulbIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5"><path d="M7.5 14.5h5M8.5 17h3M10 3a5 5 0 0 0-3 9c.6.5 1 1.1 1 1.8v.7h4v-.7c0-.7.4-1.3 1-1.8a5 5 0 0 0-3-9z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

const JOURNEY = ["Plan", "Your posts", "Approve", "Publish"];

function journeyIndex(status: string) {
  if (status === "generating") return 1;
  if (status === "review") return 2;
  if (status === "approved" || status === "publishing" || status === "published") return 3;
  return 0;
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

function WaitingCard({ campaign, shopName, step, href, eyebrow = "Waiting on you", highlight, goesOut, connected }: {
  campaign: Campaign; shopName: string; step: string; href: string; eyebrow?: string; highlight: boolean; goesOut?: string;
  connected: (platform: string) => boolean;
}) {
  const nav = useNavigate();
  const used = new Set(campaign.brain?.strategy?.platforms ?? []);
  const platforms = [...PLATFORMS];
  const languages = languagesOf(campaign);
  const offer = offerParts(campaign);
  const stage = journeyIndex(campaign.status);
  const posters = (campaign.assets ?? []).filter((a) => a.is_selected && a.media_url).slice(0, 4);
  const cells = platforms.flatMap((p) => languages.map((l) => ({ p, l, ...cellFor(p, l, campaign, campaign.assets, connected(p), used.has(p)) })));
  const columns = `minmax(9rem, auto) repeat(${Math.max(languages.length, 1)}, 2.75rem)`;

  return (
    <BorderBeam active={highlight} radius="rounded-3xl">
      <div className={`${highlight ? "" : "lm-card rounded-3xl border"} grid items-center gap-10 bg-white p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_17rem]`}>
        <div>
          <p className="lm-glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-slate-700">
            <span aria-hidden="true" className="relative flex h-2 w-2">
              {highlight && <span className="lm-pulse-ring absolute inset-0 rounded-full bg-brand-500" />}
              <span className={`relative h-2 w-2 rounded-full ${eyebrow === "Needs an account" ? "bg-amber-500" : "bg-brand-600"}`} />
            </span>
            {eyebrow}
          </p>
          <Link to={href} className={`mt-3 block rounded-lg ${focusCls}`}>
            <span className="font-display text-4xl leading-none text-slate-900 hover:underline">{campaign.title}</span>
            <span className="ml-2 text-base text-slate-600">· {shopName}</span>
          </Link>
          {offer && <OfferStrip figure={offer.figure} condition={offer.condition} dates={offer.dates} />}
          {platforms.length > 0 && languages.length > 0 && (
            <div className="mt-6 grid items-center gap-x-3 gap-y-2" style={{ gridTemplateColumns: columns }}>
              <span />
              {languages.map((l) => (
                <span key={l} className="text-center text-xs font-medium text-slate-600">{shortLang(l)}</span>
              ))}
              {platforms.map((p) => {
                const name = PLATFORM_NAME[p] ?? cap(p);
                const missed = languages.every((l) => cells.find((c) => c.p === p && c.l === l)?.word === "Not connected");
                return (
                  <div key={p} className={`col-span-full grid items-center gap-x-3 rounded-xl px-3 py-2 ${missed ? "bg-amber-50" : used.has(p) ? "bg-[#fdf1e4] dark:bg-[#1c1917]" : "bg-[#faf6f0] dark:bg-[#141210]"}`} style={{ gridTemplateColumns: columns }}>
                    <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <PlatformIcon platform={p} className="h-5 w-5 text-slate-900" />
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
          <ol aria-label={`Step ${stage + 1} of ${JOURNEY.length}: ${JOURNEY[stage]}`} className="mt-6">
            <div aria-hidden="true" className="flex gap-1.5">
              {JOURNEY.map((label, i) => (
                <span key={label} className="h-2 flex-1 overflow-hidden rounded-full bg-[#f1e3d1] dark:bg-[#292524]">
                  <span className="block h-full rounded-full" style={{
                    width: i <= stage ? "100%" : "0%",
                    backgroundImage: i < stage ? "linear-gradient(90deg,#059669,#10b981)" : "linear-gradient(90deg,#ea580c,#db2777)",
                  }} />
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-1.5">
              {JOURNEY.map((label, i) => (
                <span key={label} className={`flex-1 text-xs ${i === stage ? "font-semibold text-brand-700" : i < stage ? "text-emerald-800" : "text-slate-500"}`}>
                  {i < stage ? "✓ " : i === stage ? `${i + 1} ` : ""}{label}
                </span>
              ))}
            </div>
          </ol>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            {goesOut
              ? <span className="lm-glass inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-slate-700"><ClockIcon />{goesOut}</span>
              : <span />}
            <Link to={href} className={`lm-cta inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white ${focusCls}`}>{step} →</Link>
          </div>
        </div>
        <PostStack onOpen={() => nav(href)} fallback={<PosterFallback text={offer?.figure || campaign.title} />}
          posters={posters.map((a) => ({
            src: a.media_url!,
            alt: `${PLATFORM_NAME[a.platform] ?? cap(a.platform)} post in ${LANGUAGES[a.language] ?? a.language}`,
            tag: `${PLATFORM_NAME[a.platform] ?? cap(a.platform)} · ${shortLang(a.language)}`,
          }))} />
      </div>
    </BorderBeam>
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
