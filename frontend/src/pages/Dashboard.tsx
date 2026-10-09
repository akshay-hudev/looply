import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { api } from "../lib/api";
import { Asset, Brief, Business, Campaign, LANGUAGES, Learning, Me, Offer, SocialAccount } from "../lib/types";
import { Badge, Button, Card, DocumentTitle, ErrorNote, focusCls, statusLabel, statusTone } from "../lib/ui";

const WAITING = new Set(["clarifying", "strategy_review", "review"]);
const IST = 5.5 * 60 * 60 * 1000;
const WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const PLATFORM_NAME: Record<string, string> = {
  instagram: "Instagram", whatsapp: "WhatsApp", facebook: "Facebook", linkedin: "LinkedIn",
};

function offerLine(brief?: Brief, offer?: Offer): string {
  const typed = brief?.offer?.trim();
  if (typed) return typed;
  const parts = [offer?.discount, offer?.price].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return "No price or deal. We won't invent one.";
}
function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function byCreated(a: Campaign, b: Campaign) {
  return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}
function locked(c: Campaign) {
  const brief = c.brain?.brief;
  const langs = c.brain?.strategy?.languages ?? [];
  return !!(brief?.product || brief?.offer || brief?.region || brief?.audience || langs.length);
}
function productOf(c: Campaign) {
  return c.brain?.brief?.product?.trim() || c.brain?.offer?.product || c.title;
}
function stepLabel(c: Campaign, shopName: string) {
  const product = productOf(c);
  if (c.status === "strategy_review") return `Check the plan for ${shopName}`;
  if (c.status === "review") return `Approve ${product}`;
  if (c.status === "clarifying") return `Answer a question about ${product}`;
  return "";
}
function placeOf(c: Campaign, shop?: Business) {
  const region = c.brain?.brief?.region?.trim();
  if (region) return region;
  return [shop?.address, shop?.city].filter(Boolean).join(", ");
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
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: () => api.get<Campaign[]>("/campaigns") });
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => api.get<Business[]>("/businesses") });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => api.get<SocialAccount[]>("/social/accounts") });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/auth/me") });
  const rows = campaigns.data ?? [];
  const shops = businesses.data ?? [];
  const names = new Map(shops.map((b) => [b.id, b]));
  const newest = [...rows].sort((a, b) => -byCreated(a, b))[0];
  const shop = newest ? names.get(newest.business_id) : shops.length === 1 ? shops[0] : undefined;
  const learningCandidate = shop?.learnings?.[shop.learnings.length - 1];
  const learningSource = rows.find((c) => c.id === learningCandidate?.campaign_id);
  const needSimulated = !!learningCandidate?.id && !!learningCandidate.campaign_id
    && learningSource?.status === "published" && typeof learningCandidate.simulated !== "boolean";
  const analytics = useQuery({
    queryKey: ["analytics", learningCandidate?.campaign_id],
    enabled: needSimulated,
    queryFn: () => api.get<{ rows: { simulated: boolean }[] }>(`/campaigns/${learningCandidate?.campaign_id}/analytics`),
  });
  const waitingId = [...rows].filter((c) => WAITING.has(c.status)).sort(byCreated)[0]?.id;
  const accountReady = (platform: string, businessId: string) =>
    (accounts.data ?? []).some((a) => a.target_platform === platform && (!a.business_id || a.business_id === businessId));
  const accountHeroId = waitingId ? undefined : [...rows].filter((c) => c.status === "approved").sort(byCreated).find((c) => {
    const platforms = c.brain?.strategy?.platforms ?? [];
    return platforms.some((p) => !accountReady(p, c.business_id));
  })?.id;
  const featuredId = waitingId ?? accountHeroId;
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

  const waiting = rows
    .filter((c) => WAITING.has(c.status) && stepLabel(c, names.get(c.business_id)?.name || shop?.name || "your shop"))
    .sort(byCreated);
  const headline = waiting[0];
  const headlineShop = headline ? names.get(headline.business_id)?.name || shop?.name || "your shop" : "";
  const step = headline ? stepLabel(headline, headlineShop) : "";

  const blocked = accountHeroId ? rows.find((c) => c.id === accountHeroId) : undefined;
  const featuredIdShown = headline?.id ?? blocked?.id;
  const last = [...rows]
    .filter((c) => locked(c) && !WAITING.has(c.status) && c.id !== featuredIdShown)
    .sort((a, b) => -byCreated(a, b))[0];
  const lastShop = last ? names.get(last.business_id) : undefined;
  const lastBits = last
    ? [last.brain?.brief?.offer, ...languagesOf(last).map((l) => LANGUAGES[l] ?? l), placeOf(last, lastShop)].filter((bit): bit is string => !!bit)
    : [];

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
  let goOut: { text: string; at: Date; id: string; product: string } | null = null;
  for (const c of approved) {
    const platforms = c.brain?.strategy?.platforms ?? [];
    if (!platforms.length || platforms.some((p) => !accountReady(p, c.business_id))) continue;
    for (const slot of c.brain?.strategy?.posting_schedule ?? []) {
      if (!platforms.includes(slot.platform)) continue;
      const when = nextSlot(slot.day, slot.time);
      if (!when || (goOut && when.at >= goOut.at)) continue;
      const name = PLATFORM_NAME[slot.platform] ?? cap(slot.platform);
      goOut = { text: `${productOf(c)} · ${name} · ${when.label}`, at: when.at, id: c.id, product: productOf(c) };
    }
  }
  const slot = headline ? null : goOut
    ? { kind: "time" as const, text: goOut.text, id: goOut.id, product: goOut.product }
    : accountNote(approved, accountReady, names);

  const learning = pickLearning(shop, rows);
  const nextIsHero = !headline && slot?.kind !== "time" && slot?.kind !== "account" && !!last && !!lastShop;
  const recent = [...rows].sort((a, b) => -byCreated(a, b)).slice(0, 3);
  const invite = shops.length === 0
    ? "Add your business first. Then describe one promotion and LocalMind drafts it in your customers' language."
    : shops.length === 1
      ? `Describe a promotion for ${shops[0].name}. LocalMind will draft it in the languages you pick.`
      : "No campaigns yet. Describe one promotion and LocalMind drafts it in your customers' language.";

  const hero = (headline && step) || slot?.kind === "account" || slot?.kind === "time" || nextIsHero || !hasCampaigns;
  const showNextAside = !!last && !!lastShop && !nextIsHero;
  const aside = showNextAside || !!learning;

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
          {step && headline
            ? <Link className={primaryLink} to={`/campaigns/${headline.id}`}>{step}</Link>
            : slot?.kind === "account"
              ? <Link className={primaryLink} to="/accounts">{slot.action}</Link>
            : shops.length === 0
              ? <Link className={primaryLink} to="/businesses/new">Add a business</Link>
              : <Link className={primaryLink} to="/campaigns/new">New campaign</Link>}
          {(step || slot?.kind === "account") && shops.length > 0 && <Link className={ghostLink} to="/campaigns/new">New campaign</Link>}
        </div>
      </div>

      {(hero || aside) && (
        <div className={aside && hero ? "grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(16rem,1fr)]" : "grid gap-4"}>
          {headline && step && (
            <WaitingCard
              campaign={detail.data ?? headline}
              shopName={headlineShop}
              step={step}
              href={`/campaigns/${headline.id}`}
              connected={(platform) => accountReady(platform, headline.business_id)}
            />
          )}
          {!headline && slot?.kind === "account" && blocked && (
            <WaitingCard
              campaign={detail.data ?? blocked}
              shopName={names.get(blocked.business_id)?.name || shop?.name || "your shop"}
              step={slot.action}
              href="/accounts"
              eyebrow="Needs an account"
              connected={(platform) => accountReady(platform, blocked.business_id)}
            />
          )}
          {slot?.kind === "time" && (
            <Link to={`/campaigns/${slot.id}`} className={`block rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-500 ${focusCls}`}>
              <p className="text-sm text-slate-600">Goes out</p>
              <p className="text-xl font-semibold">{slot.text}</p>
              <p className="mt-4 text-sm font-medium text-brand-700">Next: Open {slot.product} →</p>
            </Link>
          )}
          {nextIsHero && last && lastShop && <NextCampaign shopName={lastShop.name} bits={lastBits} />}
          {!hasCampaigns && <p className="text-sm text-slate-600">{invite}</p>}
          {aside && (
            <div className="space-y-4">
              {showNextAside && last && lastShop && <NextCampaign shopName={lastShop.name} bits={lastBits} />}
              {learning && (
                <Link to={`/campaigns/new?learning=${learning.id}`} className={`block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-500 ${focusCls}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">Use this next time</p>
                    {learning.simulated && <Badge tone="amber">Simulated</Badge>}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{learning.recommendation || learning.insight}</p>
                </Link>
              )}
            </div>
          )}
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

function NextCampaign({ shopName, bits }: { shopName: string; bits: string[] }) {
  return (
    <Link to="/campaigns/new" className={`block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-500 ${focusCls}`}>
      <p className="font-semibold">Another promotion for {shopName}</p>
      {bits.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {bits.map((bit) => <Badge key={bit}>{bit}</Badge>)}
        </div>
      )}
    </Link>
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

function offerParts(c: Campaign) {
  const offer = c.brain?.offer;
  const brief = c.brain?.brief;
  const typed = brief?.offer?.trim() || "";
  const figure = offer?.discount?.trim() || offer?.price?.trim() || typed;
  if (!figure) return null;
  let condition = "";
  if (typed && typed !== figure) condition = typed.replace(figure, "").replace(/^[\s,·\-–]+/, "").trim();
  else if (!typed) condition = offer?.duration_text?.trim() || "";
  const start = offer?.start_date || brief?.event_date;
  const end = offer?.end_date;
  const dates = start && end && start !== end ? `${formatWhen(start)} – ${formatWhen(end)}` : formatWhen(start);
  return { figure, condition, dates };
}

function cellFor(platform: string, language: string, campaign: Campaign, assets: Asset[] | undefined, isConnected: boolean) {
  if (!isConnected) return { word: "Not connected", tone: "amber" as const, mark: "miss" as const };
  const mine = (assets ?? []).filter((a) => a.platform === platform && a.language === language && a.is_selected);
  if (mine.some((a) => a.status === "failed" || a.verification?.status === "failed")) return { word: "Failed", tone: "red" as const, mark: "fail" as const };
  if (mine.some((a) => ["verified", "approved"].includes(a.status) || a.verification?.status === "verified")) return { word: "Ready", tone: "green" as const, mark: "ready" as const };
  if (campaign.status === "generating") return { word: "Writing", tone: "blue" as const, mark: "wait" as const };
  if (campaign.status === "review") return { word: "Needs approval", tone: "blue" as const, mark: "wait" as const };
  if (campaign.status === "clarifying") return { word: "Needs an answer", tone: "amber" as const, mark: "wait" as const };
  return { word: "Needs a plan", tone: "blue" as const, mark: "wait" as const };
}

function Mark({ kind }: { kind: "ready" | "wait" | "fail" | "miss" }) {
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

function WaitingCard({ campaign, shopName, step, href, eyebrow = "Waiting on you", connected }: {
  campaign: Campaign; shopName: string; step: string; href: string; eyebrow?: string; connected: (platform: string) => boolean;
}) {
  const platforms = campaign.brain?.strategy?.platforms ?? [];
  const languages = languagesOf(campaign);
  const offer = offerParts(campaign);
  const stage = journeyIndex(campaign.status);
  const posters = (campaign.assets ?? []).filter((a) => a.is_selected && a.media_url).slice(0, 4);
  const cells = platforms.flatMap((p) => languages.map((l) => ({ p, l, ...cellFor(p, l, campaign, campaign.assets, connected(p)) })));
  const summary = platforms.map((p) => {
    const words = [...new Set(cells.filter((c) => c.p === p).map((c) => c.word))];
    const name = PLATFORM_NAME[p] ?? cap(p);
    if (words.length === 1 && words[0] === "Not connected") return `${name} isn't connected yet`;
    if (words.length === 1 && words[0] === "Ready") return `${name} is ready`;
    if (words.length === 1) return `${name} ${words[0].charAt(0).toLowerCase()}${words[0].slice(1)}`;
    return `${name}: ${words.join(", ")}`;
  }).join(". ");

  return (
    <Link to={href} className={`block rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-500 ${focusCls}`}>
      <p className="text-sm text-slate-600">{eyebrow}</p>
      <p className="text-xl font-semibold">{campaign.title} <span className="font-normal text-slate-600">· {shopName}</span></p>
      {posters.length > 0 && (
        <div className="mt-3 flex gap-2">
          {posters.map((a) => (
            <img key={a.id} src={a.media_url!} alt={`${PLATFORM_NAME[a.platform] ?? cap(a.platform)}, ${LANGUAGES[a.language] ?? a.language}`} className="h-16 w-16 rounded-xl bg-slate-100 object-cover" />
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-start gap-6">
        {offer && (
          <div className="rounded-xl bg-slate-100 p-4">
            <p className={offer.figure.length > 12 ? "text-lg font-semibold text-slate-900" : "text-3xl font-semibold text-slate-900"}>{offer.figure}</p>
            {offer.condition && <p className="mt-1 text-sm text-slate-600">{offer.condition}</p>}
            {offer.dates && <div className="mt-3"><Badge>{offer.dates}</Badge></div>}
          </div>
        )}
        {platforms.length > 0 && languages.length > 0 && (
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-x-2 border-spacing-y-2 text-sm">
              <caption className="sr-only">Status of each language on each platform</caption>
              <thead>
                <tr>
                  <th />
                  {languages.map((l) => <th key={l} scope="col" className="px-1 text-xs font-medium text-slate-600">{LANGUAGES[l] ?? l}</th>)}
                </tr>
              </thead>
              <tbody>
                {platforms.map((p) => (
                  <tr key={p}>
                    <th scope="row" className="pr-2 text-left text-sm font-medium text-slate-900">{PLATFORM_NAME[p] ?? cap(p)}</th>
                    {languages.map((l) => {
                      const cell = cells.find((c) => c.p === p && c.l === l)!;
                      return (
                        <td key={l}>
                          <Badge tone={cell.tone}>
                            <span className="inline-flex items-center gap-1"><Mark kind={cell.mark} />{cell.word}</span>
                          </Badge>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ol aria-label={`Step ${stage + 1} of ${JOURNEY.length}: ${JOURNEY[stage]}`} className="mt-5 flex flex-wrap items-center gap-2">
        {JOURNEY.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true" className="hidden h-px w-6 bg-slate-200 sm:block" />}
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${i === stage ? "bg-brand-700 text-white" : i < stage ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-600"}`}>
              <span aria-hidden="true">{i < stage ? "✓" : i + 1}</span>{label}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
        {summary && <p className="text-sm text-slate-600">{summary}.</p>}
        <p className="text-sm font-medium text-brand-700">Next: {step} →</p>
      </div>
    </Link>
  );
}

function accountNote(
  approved: Campaign[],
  connected: (platform: string, businessId: string) => boolean,
  names: Map<string, Business>,
): { kind: "account"; text: string; action: string } | null {
  const blocked = approved
    .map((c) => ({ c, missing: (c.brain?.strategy?.platforms ?? []).filter((p) => !connected(p, c.business_id)) }))
    .filter((x) => x.missing.length)
    .sort((a, b) => byCreated(a.c, b.c));
  const first = blocked[0];
  if (!first) return null;
  const labels = first.missing.map((p) => PLATFORM_NAME[p] ?? cap(p));
  const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  const shop = names.get(first.c.business_id)?.name;
  const action = labels.length === 1 ? `Connect ${labels[0]}` : "Connect accounts";
  return { kind: "account", action, text: `Connect ${list} before ${productOf(first.c)}${shop ? ` for ${shop}` : ""} can go out.` };
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
