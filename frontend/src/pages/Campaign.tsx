import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { AgentChecklist } from "../components/AgentChecklist";
import { AmplifyBeams, NATIVE_LANGUAGE } from "../components/AmplifyBeams";
import { AudienceCards, BigIdea, Bubble, BulbIcon, FactTiles, IconTile, LockIcon, ApprovalTrail, ExpandableText, InfoTip, LanguagePodium, MetricTiles, Panel, PredictedVsActual, RankBars, ReadinessDonut, SparkIcon, TypingDots, WeekStrip, WhyNote } from "../components/CampaignParts";
import { Aurora, BorderBeam, fireConfetti, Img, LOOP_GRADIENT, PostStack, PosterFallback, Reveal, ScoreRing, SlidingTabs } from "../components/fx";
import LocalityMap from "../components/LocalityMap";
import { OfferStrip, offerParts } from "../components/Offer";
import { PlatformIcon } from "../components/PlatformIcon";
import { PostPreview } from "../components/PostPreview";
import { api } from "../lib/api";
import { displayOffer } from "../lib/offer";
import { useCampaignStream } from "../lib/stream";
import { Asset, Business, Campaign as CampaignT, LANGUAGES, PLATFORM_LABELS, PLATFORMS, SocialAccount } from "../lib/types";
import { Badge, Button, Card, DocumentTitle, ErrorNote, fieldCls, focusCls, idleCls, inputCls, selectedCls, Spinner, statusTone } from "../lib/ui";

const FORMAT_NAMES: Record<string, string> = {
  post: "Feed post", story: "Story card", reel: "Reel", carousel: "Carousel", poster: "Poster",
  message: "WhatsApp message", offer_card: "Offer card", short: "Short",
};
const STAGE_TABS: Record<number, readonly Tab[]> = {
  0: ["strategy"],
  1: ["creatives", "content", "localization", "performance"],
  2: ["approval"],
  3: ["publishing", "analytics"],
};
const TAB_LABELS: Record<Tab, string> = {
  creatives: "Pictures and videos",
  strategy: "Plan",
  content: "Copy",
  localization: "Translations",
  performance: "Predictions",
  approval: "Approve",
  publishing: "Publish",
  analytics: "Results",
};

type Tab = "creatives" | "strategy" | "content" | "localization" | "performance" | "approval" | "publishing" | "analytics";

function stageForTab(t: Tab): number {
  for (const [idx, list] of Object.entries(STAGE_TABS)) {
    if ((list as readonly Tab[]).includes(t)) return Number(idx);
  }
  return 0;
}
function defaultTab(status: string): Tab {
  if (status === "strategy_review") return "strategy";
  if (status === "review") return "approval";
  if (["approved", "publishing", "published"].includes(status)) return "publishing";
  return "creatives";
}
function statusLabel(status: string): string {
  const map: Record<string, string> = {
    intake: "Starting",
    research: "Looking up the area",
    strategy: "Planning",
    strategy_review: "Check the plan",
    generating: "Writing posts",
    review: "Ready to approve",
    approved: "Approved",
    publishing: "Publishing",
    published: "Published",
    failed: "Stopped",
    clarifying: "Needs one detail",
  };
  return map[status] ?? status.replaceAll("_", " ");
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function shopOf(c: CampaignT): string {
  return c.brain.business?.name || "Your shop";
}
function productOf(c: CampaignT): string {
  return c.brain.brief?.product || c.title || "This promotion";
}
function langList(codes?: string[]) {
  return (codes ?? []).map((c) => LANGUAGES[c] ?? c).join(", ");
}
function offerLine(brief?: CampaignT["brain"]["brief"], offer?: CampaignT["brain"]["offer"]): string {
  const typed = brief?.offer?.trim();
  if (typed) return displayOffer(typed);
  if (offer?.discount) return `Deal: ${offer.discount}`;
  if (offer?.price) return `Price: ${offer.price}`;
  return "No price or deal. We won't invent one.";
}
function factRows(offer: CampaignT["brain"]["offer"]): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (offer.product) out.push({ label: "Product", value: offer.product });
  if (offer.price) out.push({ label: "Price", value: offer.price });
  if (offer.discount) out.push({ label: "Deal", value: offer.discount });
  if (offer.duration_text) out.push({ label: "When", value: offer.duration_text });
  if (offer.times) out.push({ label: "Hours", value: offer.times });
  if (offer.location) out.push({ label: "Place", value: offer.location });
  return out;
}

type Focus = { platform: string; language: string; assetId: string };

export default function CampaignPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => api.get<CampaignT>(`/campaigns/${id}`),
    refetchInterval: (query) => (query.state.data?.status === "generating" ? 2500 : false),
  });
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => api.get<Business[]>("/businesses") });
  const c = q.data;
  const live = useCampaignStream(id, c?.status === "generating");
  const [params] = useSearchParams();
  const linked = params.get("tab");
  const [picked, setTab] = useState<Tab | null>(linked && linked in TAB_LABELS ? (linked as Tab) : null);
  const [contentFocus, setContentFocus] = useState<Focus | null>(null);
  const [notice, setNotice] = useState("");
  const [regenAsset, setRegenAsset] = useState<Asset | null>(null);
  const [stepError, setStepError] = useState<unknown>(null);
  const [stepBusy, setStepBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (q.isLoading) {
    return (
      <div className="pt-10">
        <DocumentTitle title="Campaign" />
        <p role="status" className="flex items-center justify-center gap-2 text-sm text-slate-600"><Spinner /> Loading campaign</p>
      </div>
    );
  }
  if (q.isError || !c) {
    return (
      <div className="space-y-3">
        <DocumentTitle title="Campaign" />
        <ErrorNote error={new Error("Couldn't load this. Try again.")} />
        <Button onClick={() => q.refetch()}>Try again</Button>
      </div>
    );
  }

  const assets = c.assets ?? [];
  const status = live.status && c.status === "generating" ? live.status : c.status;
  const tab = picked ?? defaultTab(status);
  const stage = stageForTab(tab);
  const shop = businesses.data?.find((b) => b.id === c.business_id);
  const shopName = shop?.name || shopOf(c);
  const product = productOf(c);
  const deal = offerLine(c.brain.brief, c.brain.offer);
  const audience = c.brain.brief?.audience || c.brain.strategy?.primary_audience;
  const platforms = c.brain.strategy?.platforms ?? [];
  const languages = c.brain.strategy?.languages ?? [];
  const broken = assets.find((a) => a.is_selected && a.status === "failed" && a.verification?.verdict !== "NEEDS_WORK" && !(a.verification?.issues?.length));
  const flagged = assets.some((a) => a.is_selected && (a.verification?.verdict === "NEEDS_WORK" || (a.verification?.issues?.length ?? 0) > 0) && !a.verification?.owner_accepted);
  const step = nextStep(c, flagged);
  const planning = ["intake", "business", "locality", "audience", "strategy"].includes(c.stage ?? "");
  const stageLine = planning
    ? `Planning ${product} for ${shopName}.`
    : `Writing ${product} for ${shopName}${languages.length ? ` in ${langList(languages)}` : ""}.`;

  function openCopy(asset: Asset) {
    setContentFocus({ platform: asset.platform, language: asset.language, assetId: asset.id });
    setTab("content");
  }

  function openApproval() {
    setTab("approval");
    window.setTimeout(() => document.getElementById("approve-posts")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const place = [shop?.category, shop?.city].filter(Boolean).join(" · ");
  const offer = offerParts(c);
  const posters = assets.filter((a) => a.is_selected && a.media_url).slice(0, 4);
  const progress = status === "published" ? 4 : planning && status === "generating" ? 0 : journeyIndex(status);

  return (
    <div className="space-y-8">
      <DocumentTitle title={c.title} />

      <section className="lm-card relative overflow-hidden rounded-3xl border bg-white">
        <Aurora />
        <div className={`relative grid items-center gap-10 p-6 sm:p-10 ${posters.length ? "lg:grid-cols-[minmax(0,1fr)_17rem]" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]"}`}>
          <Reveal>
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/campaigns" className={`lm-glass rounded-full px-3 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 ${focusCls}`}>← Campaigns</Link>
              <span className="text-xs font-medium text-slate-600">{shopName}{place ? ` · ${place}` : ""}</span>
            </div>
            <h1 title={c.title} className={`mt-4 line-clamp-2 font-display leading-[1] tracking-tight text-slate-900 ${c.title.length > 60 ? "text-3xl" : c.title.length > 32 ? "text-4xl" : "text-5xl"}`}>{c.title}</h1>
            {offer ? <OfferStrip figure={offer.figure} condition={offer.condition} dates={offer.dates} /> : <p className="mt-3 text-sm text-slate-600">{deal}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
              {audience && (
                <span className="lm-glass inline-flex max-w-[16rem] items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-slate-800" title={`For ${audienceText(audience)}`}>
                  <PeopleIcon /><span className="truncate">{audienceText(audience)}</span>
                </span>
              )}
              {platforms.map((p) => (
                <span key={p} className="lm-glass inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-slate-800">
                  <PlatformIcon platform={p} className="h-4 w-4 text-slate-900" />{PLATFORM_LABELS[p] ?? cap(p)}
                </span>
              ))}
              {languages.map((l) => (
                <span key={l} className="lm-glass rounded-full px-2.5 py-1 text-xs font-medium text-slate-700" title={LANGUAGES[l] ?? l}>{NATIVE_LANGUAGE[l] ?? LANGUAGES[l] ?? l}</span>
              ))}
            </div>
          </Reveal>
          {posters.length > 0 ? (
            <PostStack onOpen={() => setTab("creatives")} fallback={<PosterFallback text={offer?.figure || product} />}
              posters={posters.map((a) => ({
                src: a.media_url!,
                alt: `${PLATFORM_LABELS[a.platform] ?? cap(a.platform)} ${FORMAT_NAMES[a.format] ?? a.format} in ${LANGUAGES[a.language] ?? a.language}`,
                tag: `${PLATFORM_LABELS[a.platform] ?? cap(a.platform)} · ${NATIVE_LANGUAGE[a.language] ?? LANGUAGES[a.language] ?? a.language}`,
              }))} />
          ) : (
            <AmplifyBeams figure={offer?.figure || product} caption={offer?.figure ? product : undefined} platforms={platforms} languages={languages} eyebrow="This offer" />
          )}
        </div>
        <div className="relative flex justify-end px-6 pb-4 sm:px-10">
          <button type="button" disabled={deleting} className={`rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 ${focusCls}`} onClick={async () => {
            if (!window.confirm(`Delete “${c.title}”? Its posts are removed from LOOPLY.`)) return;
            setDeleting(true);
            setStepError(null);
            try {
              await api.del(`/campaigns/${c.id}`);
              await qc.invalidateQueries({ queryKey: ["campaigns"] });
              nav("/campaigns");
            } catch (e) { setStepError(e); setDeleting(false); }
          }}>{deleting ? "Deleting…" : "Delete campaign"}</button>
        </div>
      </section>
      <ErrorNote error={stepError} />

      {status === "generating" && (
        <AgentChecklist stage={c.stage ?? "intake"} events={live.events} assets={assets}
          platforms={platforms} languages={languages} shopName={shopName} headline={stageLine} />
      )}

      {c.brain.clarifying_questions?.length > 0 && status === "clarifying" && <Clarify campaign={c} />}

      {step && status !== "generating" && (
        <Reveal delay={0.08}>
          <BorderBeam radius="rounded-3xl">
            <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
              <div className="flex min-w-0 items-start gap-4">
                <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[#ffffff] shadow-sm" style={{ backgroundImage: LOOP_GRADIENT }}>
                  <svg viewBox="0 0 20 20" className="h-5 w-5"><path d="M10 2.5l1.8 4.6 4.7 1.8-4.7 1.8L10 15.5l-1.8-4.8-4.7-1.8 4.7-1.8z" fill="currentColor" /></svg>
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">Your next step</p>
                  <p className="font-display text-2xl leading-tight text-slate-900">{step.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-sm text-slate-600" title={step.detail}>{step.detail}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={stepBusy} onClick={async () => {
                  if (c.status === "failed") {
                    setStepError(null);
                    setStepBusy(true);
                    try {
                      await api.post(`/campaigns/${c.id}/strategy/accept`);
                      await qc.invalidateQueries({ queryKey: ["campaign", id] });
                    } catch (e) { setStepError(e); }
                    finally { setStepBusy(false); }
                    return;
                  }
                  if (step.tab === "content" && broken) openCopy(broken);
                  else if (step.tab === "approval") openApproval();
                  else setTab(step.tab);
                }}>{stepBusy ? "Starting…" : step.action}</Button>
                {flagged && (c.status === "review" || c.status === "approved") && (
                  <Button kind="ghost" disabled={stepBusy} onClick={async () => {
                    setStepError(null);
                    setStepBusy(true);
                    try {
                      await api.post(`/campaigns/${c.id}/accept-flags`);
                      await qc.invalidateQueries({ queryKey: ["campaign", id] });
                      openApproval();
                    } catch (e) { setStepError(e); }
                    finally { setStepBusy(false); }
                  }}>{stepBusy ? "Keeping the posts…" : "Proceed anyway"}</Button>
                )}
              </div>
            </div>
          </BorderBeam>
        </Reveal>
      )}

      <Journey progress={progress} viewing={stage} onJump={(i) => setTab(STAGE_TABS[i][0])} />

      {STAGE_TABS[stage].length > 1 && (
        <SlidingTabs id="campaign-tabs" label="Campaign sections" value={tab} onChange={setTab}
          items={STAGE_TABS[stage].map((t) => ({ id: t, label: TAB_LABELS[t] }))} />
      )}

      <div role="tabpanel">
        {tab === "creatives" && (
          <CreativesTab assets={assets} generating={status === "generating"} awaitingPlan={status === "strategy_review"}
            shopName={shopName} product={product} languageLine={langList(languages) || "the languages you chose"} onOpen={openCopy} onRegenerate={setRegenAsset} />
        )}
        {tab === "strategy" && <StrategyTab campaign={c} onChanged={() => qc.invalidateQueries({ queryKey: ["campaign", id] })} />}
        {tab === "content" && <ContentTab campaign={c} assets={assets} focus={contentFocus} onChanged={() => qc.invalidateQueries({ queryKey: ["campaign", id] })} onRegenerate={setRegenAsset} />}
        {tab === "localization" && <LocalizationTab assets={assets} />}
        {tab === "performance" && <PerformanceTab campaign={c} />}
        {tab === "approval" && (
          <ApprovalTab campaign={c} onChanged={() => qc.invalidateQueries({ queryKey: ["campaign", id] })}
            onApproved={() => { setNotice("Approved. Nothing publishes until you say so."); setTab("publishing"); }} />
        )}
        {tab === "publishing" && <PublishingTab campaign={c} notice={notice} onGoto={setTab} onEdit={openCopy} />}
        {tab === "analytics" && <AnalyticsTab campaign={c} />}
      </div>

      {regenAsset && (
        <RegenerateDialog
          asset={regenAsset}
          onClose={() => setRegenAsset(null)}
          onComplete={() => qc.invalidateQueries({ queryKey: ["campaign", id] })}
        />
      )}
    </div>
  );
}

const JOURNEY = ["Plan", "Your posts", "Approve", "Publish"] as const;

function journeyIndex(status: string) {
  if (status === "generating") return 1;
  if (status === "review") return 2;
  if (status === "approved" || status === "publishing" || status === "published") return 3;
  return 0;
}

/** The four stages as connected stops. Done stops tick green, the live one glows, the one on screen is ringed. */
function Journey({ progress, viewing, onJump }: { progress: number; viewing: number; onJump: (i: number) => void }) {
  const reduce = useReducedMotion();
  const fill = Math.min(progress, JOURNEY.length - 1) / (JOURNEY.length - 1);
  return (
    <nav aria-label="Campaign steps" className="lm-card rounded-3xl border bg-white px-4 py-5 sm:px-8">
      <ol className="relative grid grid-cols-4">
        <span aria-hidden="true" className="absolute left-[12.5%] right-[12.5%] top-5 h-1 -translate-y-1/2 rounded-full bg-[#f1e3d1] dark:bg-[#292524]">
          <motion.span className="block h-full rounded-full" style={{ backgroundImage: "linear-gradient(90deg,#059669,#f97316,#db2777)" }}
            initial={false} animate={{ width: `${fill * 100}%` }} transition={reduce ? { duration: 0 } : { duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
        </span>
        {JOURNEY.map((label, i) => {
          const done = i < progress;
          const live = i === progress;
          const on = i === viewing;
          return (
            <li key={label} className="relative flex justify-center">
              <button type="button" onClick={() => onJump(i)} aria-current={on ? "step" : undefined}
                className={`group flex flex-col items-center gap-2 rounded-xl px-2 ${focusCls}`}>
                <span className={`relative flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-transform group-hover:scale-105 motion-reduce:transition-none ${on ? "ring-4 ring-brand-200 dark:ring-[#3a1c0c]" : ""} ${
                  done ? "bg-emerald-600 text-white" : live ? "lm-cta text-white" : "lm-glass text-slate-600"}`}>
                  {live && !reduce && <span aria-hidden="true" className="lm-pulse-ring absolute inset-0 rounded-full bg-brand-500" />}
                  <span className="relative">{done ? "✓" : i + 1}</span>
                </span>
                <span className={`text-sm ${on ? "font-semibold text-slate-900" : done ? "text-emerald-800" : live ? "font-medium text-brand-700" : "text-slate-500"}`}>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}


function nextStep(c: CampaignT, hasFailures: boolean): { title: string; detail: string; tab: Tab; action: string } | null {
  const name = shopOf(c);
  const product = productOf(c);
  const platforms = (c.brain.strategy?.platforms ?? []).map(cap).join(", ") || "your accounts";
  const languages = langList(c.brain.strategy?.languages);
  const audience = c.brain.brief?.audience || c.brain.strategy?.primary_audience || "your customers";
  const deal = offerLine(c.brain.brief, c.brain.offer);
  if (c.status === "strategy_review") {
    return {
      title: `Check the plan for ${name}`,
      detail: `${product} for ${audience}, on ${platforms}${languages ? `, in ${languages}` : ""}.`,
      tab: "strategy",
      action: "Accept this plan",
    };
  }
  if (c.status === "review") {
    return {
      title: `Approve ${product}`,
      detail: hasFailures
        ? `${deal} A fact check left a note. Edit the line, or proceed with the image as it is.`
        : `Check the posts you want, or check all of them, then approve.`,
      tab: "approval",
      action: "Review and approve",
    };
  }
  if (c.status === "approved") {
    return { title: `Publish ${product} for ${name}`, detail: "You can send it now or pick a time.", tab: "publishing", action: "Go to publish" };
  }
  if (c.status === "failed") {
    return {
      title: `The plan for ${name} stopped before the posts were ready`,
      detail: `${product} for ${audience}, on ${platforms}${languages ? `, in ${languages}` : ""}. Continue to write the posts.`,
      tab: "strategy",
      action: c.brain.strategy?.accepted ? "Write the posts" : "Accept this plan",
    };
  }
  return null;
}

function Clarify({ campaign }: { campaign: CampaignT }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [sent, setSent] = useState("");
  const send = useMutation({
    mutationFn: () => api.post(`/campaigns/${campaign.id}/messages`, { message: text }),
    onMutate: () => setSent(text),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["campaign", campaign.id] });
    },
  });

  const SUGGESTIONS = [
    "Focus on college students and young professionals",
    "Highlight our special discount offer",
    "Promote weekend walk-in visits",
    "Include both Kannada and English messaging",
    "Use a fun, energetic and youthful tone",
    "Emphasize locally sourced ingredients",
  ];

  function toggleSuggestion(s: string) {
    if (text.includes(s)) {
      setText((t) => t.replace(s, "").replace(/,\s*,/g, ",").replace(/^,\s*|,\s*$/g, "").trim());
    } else {
      setText((t) => (t ? `${t}, ${s}` : s));
    }
  }

  return (
    <BorderBeam radius="rounded-3xl">
      <div className="flex items-center gap-3 border-b border-[#f1e3d1] px-5 py-4 dark:border-[#292524]">
        <IconTile><SparkIcon /></IconTile>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">One question</p>
          <p className="font-display text-2xl leading-tight text-slate-900">One detail about {productOf(campaign) || shopOf(campaign)} is missing</p>
        </div>
      </div>
      <div className="space-y-3 bg-[#fffaf3] px-5 py-5 dark:bg-[#141210]" aria-live="polite">
        {campaign.brain.clarifying_questions.map((q, i) => <Bubble key={i} from="ai">{q}</Bubble>)}
        {send.isPending && (
          <>
            <Bubble from="me">{sent}</Bubble>
            <Bubble from="ai"><TypingDots /><span className="ml-2 text-xs text-slate-600">Answer received. Planning continues in a moment.</span></Bubble>
          </>
        )}
      </div>
      <div className="space-y-3 px-5 py-4">
        <p className="text-xs font-medium text-slate-600">Quick replies · tap to add, tap again to remove</p>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => {
            const isSel = text.includes(s);
            return (
              <button key={s} type="button" aria-pressed={isSel} onClick={() => toggleSuggestion(s)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${focusCls} ${isSel ? "lm-cta font-semibold text-white" : "lm-glass text-slate-700 hover:text-slate-900"}`}>
                {isSel ? `✓ ${s}` : `+ ${s}`}
              </button>
            );
          })}
        </div>
        <div className="lm-glass flex items-center gap-2 rounded-2xl p-1.5 pl-4 focus-within:ring-2 focus-within:ring-brand-500">
          <input aria-label="Your answer" className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-500" value={text}
            onChange={(e) => setText(e.target.value)} placeholder="Your answer or additional details"
            onKeyDown={(e) => { if (e.key === "Enter" && text && !send.isPending) send.mutate(); }} />
          <button type="button" onClick={() => send.mutate()} disabled={!text || send.isPending}
            className={`lm-cta rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-600 ${focusCls}`}>
            {send.isPending ? "Sending…" : "Send"}
          </button>
        </div>
        <ErrorNote error={send.error} />
      </div>
    </BorderBeam>
  );
}

function StrategyTab({ campaign, onChanged }: { campaign: CampaignT; onChanged: () => void }) {
  const s = campaign.brain.strategy;
  const loc = campaign.brain.locality;
  const offer = campaign.brain.offer;
  const [langs, setLangs] = useState<string[]>(s.languages);
  const [tone, setTone] = useState(s.tone);
  const [codeSwitching, setCodeSwitching] = useState(s.code_switching ?? true);
  const [codeSwitchingStyle, setCodeSwitchingStyle] = useState(s.code_switching_style ?? "kanglish_hinglish");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<"save" | "accept" | null>(null);
  const ready = campaign.status === "strategy_review" || campaign.status === "failed";

  const TONES = [
    "Fun & youthful", "Warm & friendly", "Premium & elegant",
    "Bold & energetic", "Calm & trustworthy", "Witty & quirky",
  ];

  function toggleTone(t: string) {
    const selected = (tone || "").split(",").map((x) => x.trim()).filter(Boolean);
    const next = selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t];
    setTone(next.join(", "));
  }

  function toggleLang(code: string) {
    setLangs(langs.includes(code) ? langs.filter((l) => l !== code) : [...langs, code]);
  }
  async function save() {
    setError(null);
    setBusy("save");
    try {
      await api.put(`/campaigns/${campaign.id}/strategy`, {
        languages: langs,
        tone,
        code_switching: codeSwitching,
        code_switching_style: codeSwitchingStyle,
      });
      onChanged();
    } catch (e) { setError(e); } finally { setBusy(null); }
  }
  async function accept() {
    setError(null);
    setBusy("accept");
    try { await api.post(`/campaigns/${campaign.id}/strategy/accept`); onChanged(); } catch (e) { setError(e); } finally { setBusy(null); }
  }

  const brief = campaign.brain.brief;
  const name = shopOf(campaign);
  const core = campaign.brain.core_message;
  const audiences = campaign.brain.audiences ?? [];
  const hasIdea = !!core && !!(core.headline || core.key_message);
  const optionCls = (on: boolean) => `rounded-2xl border-2 p-3 text-left text-sm transition-colors ${focusCls} ${
    on ? "border-brand-600 bg-brand-50" : "border-[#f1e3d1] bg-white hover:border-brand-300 dark:border-[#292524]"}`;

  return (
    <div className="space-y-6">
      {hasIdea && <BigIdea core={core!} why={s.rationale || undefined} />}

      <Panel eyebrow="The plan" title={`Plan for ${name}`}>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: "🎯", label: "Goal", value: s.objective || brief?.goal || "This campaign" },
            { icon: "👥", label: "For", value: s.primary_audience || brief?.audience || "your customers" },
            { icon: "🏷️", label: "Offer", value: offerLine(brief, offer) },
          ].map((t) => (
            <div key={t.label} className="rounded-2xl bg-[#fdf1e4] p-3 dark:bg-[#1c1917]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500"><span aria-hidden="true">{t.icon}</span> {t.label}</p>
              <ExpandableText text={t.value} lines={2} className="mt-1 text-sm font-medium text-slate-900" />
            </div>
          ))}
        </div>
        {s.platforms.length > 0 && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {s.platforms.map((p) => (
              <div key={p} className="lm-glass rounded-2xl p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><PlatformIcon platform={p} className="h-5 w-5 text-slate-900" />{PLATFORM_LABELS[p] ?? cap(p)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(s.formats[p] ?? []).map((f) => <span key={f} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">{FORMAT_NAMES[f] ?? f}</span>)}
                  {!(s.formats[p] ?? []).length && <span className="text-xs text-slate-500">Formats picked when writing</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        {!hasIdea && s.rationale && <div className="mt-5"><WhyNote text={s.rationale} /></div>}
      </Panel>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {audiences.length > 0 && (
            <Panel eyebrow="Who it's for" title="The people we'll talk to">
              <AudienceCards audiences={audiences} />
            </Panel>
          )}
          {s.posting_schedule.length > 0 && (
            <Panel eyebrow="When it goes out" title="Your week">
              <WeekStrip schedule={s.posting_schedule} />
            </Panel>
          )}
        </div>
        <div className="space-y-6">
          <Panel eyebrow="Locked" title="Your facts" aside={<InfoTip label="Every post is checked">LOOPLY checks every price, date and claim in every post against these facts before you see it.</InfoTip>}>
            <div className="space-y-3 text-sm">
              <FactTiles rows={[
                ...(brief?.product ? [{ label: "Promoting", value: brief.product }] : []),
                ...(brief?.offer && !offer.discount ? [{ label: "Deal", value: displayOffer(brief.offer) }] : []),
                ...factRows(offer).filter((r) => !(r.label === "Product" && r.value === brief?.product)),
                ...(brief?.highlights ? [{ label: "Special", value: brief.highlights }] : []),
              ]} />
              {(campaign.brain.files ?? []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {(campaign.brain.files ?? []).map((f) => (
                    <a key={f.url} href={f.url} className={`lm-glass rounded-full px-3 py-1 text-xs font-medium text-slate-800 underline-offset-2 hover:underline ${focusCls}`} target="_blank" rel="noreferrer">📎 {f.filename}</a>
                  ))}
                </div>
              )}
            </div>
          </Panel>
          <Panel eyebrow="The neighbourhood" title={`Near ${name}`} aside={loc.verified ? <Badge tone="green">verified · {loc.data_source}</Badge> : undefined}>
            <div className="overflow-hidden rounded-2xl"><LocalityMap locality={loc} businessName={campaign.brain.business?.name} /></div>
            {loc.signals.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {loc.signals.map((sg, i) => (
                  <div key={i} className="rounded-xl bg-[#fdf1e4] px-3 py-2 dark:bg-[#1c1917]">
                    <p className="font-display text-3xl leading-none text-slate-900">{sg.count}</p>
                    <p className="text-xs font-semibold capitalize text-slate-700">{sg.type} nearby</p>
                    {(sg.examples.length > 0 || sg.nearest_m) && (
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {sg.examples.slice(0, 2).join(", ")}{sg.nearest_m ? `${sg.examples.length ? " · " : ""}nearest ${sg.nearest_m} m` : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {loc.language_signals.length > 0 && (
              <div className="mt-5">
                <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Languages people speak here</p>
                <LanguagePodium signals={loc.language_signals} native={NATIVE_LANGUAGE} />
              </div>
            )}
            {loc.insights.length > 0 && (
              <details className="mt-4 rounded-xl bg-[#fdf1e4] px-3 py-2 dark:bg-[#1c1917]">
                <summary className={`cursor-pointer text-xs font-semibold text-slate-700 ${focusCls}`}>Why it matters · {loc.insights.length} notes</summary>
                <ul className="mt-2 space-y-2 text-sm text-slate-700">
                  {loc.insights.map((ins, i) => <li key={i} className="flex gap-2"><span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />{ins.interpretation}</li>)}
                </ul>
              </details>
            )}
          </Panel>
        </div>
      </div>

      <Panel eyebrow="Your voice" title="How it should sound" aside={!ready ? <Button kind="ghost" small disabled={busy !== null} onClick={save}>{busy === "save" ? "Saving…" : "Save edits"}</Button> : undefined}>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">Tone <span className="font-normal text-slate-500">· pick any, or type your own</span></p>
            <div className="flex flex-wrap gap-2">
              {TONES.map((t) => {
                const isSel = (tone || "").includes(t);
                return (
                  <button key={t} type="button" aria-pressed={isSel} onClick={() => toggleTone(t)}
                    className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${focusCls} ${isSel ? "lm-cta font-semibold text-white" : "lm-glass text-slate-700 hover:text-slate-900"}`}>
                    {isSel ? "✓ " : ""}{t}
                  </button>
                );
              })}
            </div>
            <input aria-label="Tone" className={inputCls} value={tone} onChange={(e) => setTone(e.target.value)} />
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">Mixing languages</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" aria-pressed={codeSwitching} onClick={() => { setCodeSwitching(true); setCodeSwitchingStyle("kanglish_hinglish"); }} className={optionCls(codeSwitching)}>
                <span className="block font-display text-xl text-slate-900">Kanglish · Hinglish</span>
                <span className="mt-0.5 block text-xs text-slate-600">Everyday mix with natural English words, the way people text.</span>
              </button>
              <button type="button" aria-pressed={!codeSwitching} onClick={() => { setCodeSwitching(false); setCodeSwitchingStyle("native_pure"); }} className={optionCls(!codeSwitching)}>
                <span className="block font-display text-xl text-slate-900">Pure native script</span>
                <span className="mt-0.5 block text-xs text-slate-600">Proper written language without English loanwords.</span>
              </button>
            </div>
          </div>
        </div>
        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold text-slate-900">Languages <span className="font-normal text-slate-500">· {langs.length} chosen</span></p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(LANGUAGES).map(([code, label]) => {
              const on = langs.includes(code);
              const native = NATIVE_LANGUAGE[code];
              return (
                <button key={code} type="button" aria-pressed={on} onClick={() => toggleLang(code)}
                  className={`rounded-xl px-3 py-1.5 text-sm transition-colors ${focusCls} ${on ? "lm-cta text-white" : "lm-glass text-slate-700 hover:text-slate-900"}`}>
                  <span className="font-medium">{native && native !== label ? native : label}</span>
                  {native && native !== label && <span className={`ml-1.5 text-xs ${on ? "text-white/80" : "text-slate-500"}`}>{label}</span>}
                </button>
              );
            })}
          </div>
        </div>
        {!ready && <ErrorNote error={error} />}
      </Panel>

      {ready && (
        <div className="sticky bottom-4 z-30">
          <BorderBeam radius="rounded-3xl" className="shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6">
              <div className="flex items-center gap-3">
                <IconTile><SparkIcon /></IconTile>
                <div>
                  <p className="font-display text-2xl leading-tight text-slate-900">Happy with this plan?</p>
                  <p className="text-sm text-slate-600">LOOPLY writes every post{langs.length ? ` in ${langList(langs)}` : ""} as soon as you accept.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button kind="ghost" disabled={busy !== null} onClick={save}>{busy === "save" ? "Saving…" : "Save edits"}</Button>
                <Button disabled={busy !== null} onClick={accept}>{busy === "accept" ? "Starting…" : campaign.status === "failed" && s.accepted ? "Write the posts" : "Accept plan and write the posts"}</Button>
              </div>
              <div className="w-full"><ErrorNote error={error} /></div>
            </div>
          </BorderBeam>
        </div>
      )}
    </div>
  );
}

function CreativesTab({ assets, generating, awaitingPlan, shopName, product, languageLine, onOpen, onRegenerate }: {
  assets: Asset[];
  generating: boolean;
  awaitingPlan: boolean;
  shopName: string;
  product: string;
  languageLine: string;
  onOpen: (asset: Asset) => void;
  onRegenerate: (asset: Asset) => void;
}) {
  const languages = [...new Set(assets.map((a) => a.language))];
  const [language, setLanguage] = useState(languages[0] ?? "en");
  const [all, setAll] = useState(false);
  const [zoom, setZoom] = useState<{ src: string; title: string } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!zoom) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setZoom(null); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoom]);
  if (!assets.length) {
    return (
      <Card className="text-sm text-slate-600">
        {generating
          ? "Your creatives are being written, designed and fact-checked. They appear here as soon as they're ready."
          : awaitingPlan
            ? `Accept the plan and ${product} will show up here in ${languageLine}.`
            : `Accept the plan and ${product} will show up here in ${languageLine}.`}
      </Card>
    );
  }
  const shown = assets.filter((a) => a.language === language && (all || a.is_selected))
    .sort((a, b) => Number(!a.media_url) - Number(!b.media_url) || a.platform.localeCompare(b.platform));
  const previewOnly = shown.some((a) => a.content.media_source === "composed" || a.content.media_source === "storyboard");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {languages.map((l) => (
          <button key={l} type="button" onClick={() => setLanguage(l)}
            className={`rounded-lg px-2.5 py-1 ${focusCls} ${l === language ? selectedCls : idleCls}`}>{LANGUAGES[l] ?? l}</button>
        ))}
        <label className="ml-auto flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show all variants (A/B/C)
        </label>
      </div>
      {previewOnly && (
        <InfoTip label="Composed by LOOPLY">
          These designs were composed by LOOPLY from your verified copy, so you can see and download every creative right now.
          Photos and video stay as previews until an image service is connected.
        </InfoTip>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((a) => <CreativeCard key={a.id} asset={a} shopName={shopName} onZoom={setZoom} onOpen={() => onOpen(a)} onRegenerate={() => onRegenerate(a)} />)}
      </div>
      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" role="dialog" aria-modal="true" aria-label={zoom.title} onClick={() => setZoom(null)}>
          <div className="max-h-full max-w-3xl space-y-2 text-center" onClick={(e) => e.stopPropagation()}>
            <img src={zoom.src} alt={zoom.title} className="mx-auto max-h-[80vh] rounded-xl bg-white shadow-2xl" />
            <div className="flex flex-wrap justify-center gap-2">
              <a href={zoom.src} download className={`rounded-lg border border-slate-500 bg-white px-3 py-1.5 text-sm font-medium ${focusCls}`}>Download</a>
              <a href={zoom.src} target="_blank" rel="noreferrer" className={`rounded-lg border border-slate-500 bg-white px-3 py-1.5 text-sm font-medium ${focusCls}`}>Open in new tab</a>
              <button ref={closeRef} type="button" onClick={() => setZoom(null)} className={`rounded-lg border border-slate-500 bg-white px-3 py-1.5 text-sm font-medium ${focusCls}`}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FactNotes({ asset }: { asset: Asset }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const notes = (asset.verification?.issues ?? [])
    .filter((issue) => issue.severity === "high" || issue.severity === "medium")
    .slice(0, 2)
    .map((issue) => {
      const row = issue as { detail?: string; found?: string; expected?: string };
      if (row.detail) return row.detail;
      if (row.found && row.expected) return `${row.found}. Your facts say ${row.expected}.`;
      return "";
    })
    .filter(Boolean);
  if (!notes.length || asset.verification?.owner_accepted) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs text-amber-800">
        Worth a look. The creative stays up — edit the copy if a line should change. {notes.join(" ")}
      </p>
      <Button kind="ghost" small disabled={busy} onClick={async () => {
        setBusy(true);
        setError(null);
        try {
          await api.post(`/assets/${asset.id}/accept-flag`);
          await qc.invalidateQueries({ queryKey: ["campaign", asset.campaign_id] });
        } catch (e) { setError(e); }
        finally { setBusy(false); }
      }}>{busy ? "Keeping it…" : "Proceed anyway"}</Button>
      <ErrorNote error={error} />
    </div>
  );
}

/** Who made the picture: Claude, LOOPLY's composer, or an image model. */
function sourceLabel(a: Asset): string {
  const c = a.content;
  if (c.media_source === "storyboard") return c.storyboard_by === "claude" ? "Storyboard by Claude" : "Animated storyboard";
  if (c.media_source === "claude") return "Designed by Claude";
  if (c.media_source === "composed") return "Composed design";
  return "AI generated";
}

function mediaNote(a: Asset): string {
  if (a.media_status === "pending" || a.media_status === "processing") return "The words are ready. The picture is still rendering.";
  if (a.content.media_error) return "The picture didn't come through. The copy below is still yours.";
  return "Text-only. The copy below is ready to review.";
}

function CreativeCard({
  asset: a,
  shopName,
  onZoom,
  onOpen,
  onRegenerate,
}: {
  asset: Asset;
  shopName: string;
  onZoom: (z: { src: string; title: string }) => void;
  onOpen: () => void;
  onRegenerate: () => void;
}) {
  const title = `${FORMAT_NAMES[a.format] ?? a.format} · ${a.platform}`;
  const slides = a.content.slide_urls ?? [];
  const [slide, setSlide] = useState(0);
  const src = slides.length > 1 ? slides[slide] : a.media_url;
  const source = a.content.media_source;
  return (
    <Card compact className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2">
        <p className="min-w-0 truncate text-xs font-medium text-slate-600">{FORMAT_NAMES[a.format] ?? a.format} · {PLATFORM_LABELS[a.platform] ?? cap(a.platform)} · {LANGUAGES[a.language] ?? a.language}</p>
        <span className="ml-auto shrink-0"><Badge tone={statusTone(a.status)}>{statusLabel(a.status)}</Badge></span>
      </div>
      <PostPreview asset={a} shopName={shopName} src={src} emptyNote={mediaNote(a)} onZoom={() => src && onZoom({ src, title })} />
      {slides.length > 1 && (
        <div className="flex gap-1 overflow-auto">
          {slides.map((u, i) => (
            <button key={i} type="button" onClick={() => setSlide(i)} className={`shrink-0 rounded ${focusCls} ${i === slide ? "ring-2 ring-brand-700" : ""}`}>
              <img src={u} alt={`slide ${i + 1}`} className="h-14 rounded" />
            </button>
          ))}
        </div>
      )}
      {a.format === "reel" && (a.content.video_script?.scenes ?? []).length > 0 && (
        <ol className="space-y-0.5 text-xs text-slate-600">
          {a.content.video_script!.scenes!.map((s, i) => <li key={i}><b>{s.t}</b> {s.overlay_text} <span className="text-slate-600">— {s.visual}</span></li>)}
        </ol>
      )}
      {a.content.media_note && <p className="text-xs text-amber-800">{a.content.media_note}</p>}
      <FactNotes asset={a} />
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs">
        {src && <a href={src} download className={`rounded border border-slate-500 px-2 py-1 hover:bg-slate-50 ${focusCls}`}>Download</a>}
        {slides.length > 1 && <span className="text-slate-600">slide {slide + 1}/{slides.length}</span>}
        <Button kind="ghost" small onClick={onOpen}>Edit copy</Button>
        <Button kind="ghost" small onClick={onRegenerate}>🔄 Regenerate image</Button>
        {typeof a.content.svg_url === "string" && <a href={a.content.svg_url} download className={`rounded border border-slate-500 px-2 py-1 hover:bg-slate-50 ${focusCls}`}>SVG</a>}
        {source && <span className="ml-auto text-slate-600">{sourceLabel(a)}</span>}
      </div>
    </Card>
  );
}

function assetText(a: Asset): string {
  const c = a.content;
  return [c.headline, c.hook, c.body, c.cta, ...(c.slides ?? []), ...(c.hashtags ?? [])].filter(Boolean).join("\n\n");
}

function ContentTab({
  campaign,
  assets,
  focus,
  onChanged,
  onRegenerate,
}: {
  campaign: CampaignT;
  assets: Asset[];
  focus: Focus | null;
  onChanged: () => void;
  onRegenerate: (asset: Asset) => void;
}) {
  const [platform, setPlatform] = useState(focus?.platform ?? assets[0]?.platform ?? "");
  const [language, setLanguage] = useState(focus?.language ?? assets[0]?.language ?? "");
  useEffect(() => {
    if (!focus) return;
    setPlatform(focus.platform);
    setLanguage(focus.language);
    window.setTimeout(() => document.getElementById(`asset-${focus.assetId}`)?.scrollIntoView({ block: "center" }), 50);
  }, [focus]);
  const shown = assets.filter((a) => a.platform === platform && a.language === language);
  const platforms = [...new Set(assets.map((a) => a.platform))];
  const languages = [...new Set(assets.map((a) => a.language))];
  if (!assets.length) return <p className="text-sm text-slate-600">Copy appears here once the plan is accepted.</p>;
  const byFormat = new Map<string, Asset[]>();
  for (const a of shown) byFormat.set(a.format, [...(byFormat.get(a.format) ?? []), a]);
  const must = campaign.brain.core_message?.must_include ?? [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <SlidingTabs id="copy-platform" label="Platform" value={platform} onChange={setPlatform}
          items={platforms.map((p) => ({ id: p, label: PLATFORM_LABELS[p] ?? cap(p) }))} />
        <SlidingTabs id="copy-language" label="Language" value={language} onChange={setLanguage}
          items={languages.map((l) => ({ id: l, label: NATIVE_LANGUAGE[l] ?? LANGUAGES[l] ?? l }))} />
      </div>
      <div className="lm-glass flex flex-wrap items-center gap-2 rounded-2xl px-4 py-2.5 text-xs">
        <span className="inline-flex items-center gap-1 font-semibold text-slate-700"><LockIcon />Every version must keep</span>
        {(must.length ? must : [offerLine(campaign.brain.brief, campaign.brain.offer)]).map((m) => (
          <span key={m} className="rounded-full bg-brand-50 px-2.5 py-0.5 font-medium text-brand-700">{m}</span>
        ))}
      </div>
      {!shown.length && <p className="text-sm text-slate-600">Nothing for this platform in this language. Pick another above.</p>}
      {[...byFormat].map(([fmt, list]) => {
        const sorted = [...list].sort((x, y) => x.variant.localeCompare(y.variant));
        const scored = sorted.filter((a) => typeof a.prediction?.predicted_score === "number");
        const bestId = scored.length > 1 ? scored.reduce((m, a) => ((a.prediction.predicted_score ?? 0) > (m.prediction.predicted_score ?? 0) ? a : m)).id : "";
        return (
          <section key={fmt} className="space-y-3">
            <h3 className="font-display text-3xl text-slate-900">
              {FORMAT_NAMES[fmt] ?? fmt} <span className="text-xl text-slate-500">· {sorted.length} {sorted.length === 1 ? "version" : "versions"}</span>
            </h3>
            <div className={`grid items-start gap-4 ${sorted.length >= 3 ? "lg:grid-cols-3" : sorted.length === 2 ? "md:grid-cols-2" : "max-w-xl"}`}>
              {sorted.map((a) => (
                <AssetCard key={a.id} asset={a} campaign={campaign} best={a.id === bestId} onChanged={onChanged} onRegenerate={() => onRegenerate(a)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AssetCard({
  asset,
  campaign,
  best,
  onChanged,
  onRegenerate,
}: {
  asset: Asset;
  campaign: CampaignT;
  best: boolean;
  onChanged: () => void;
  onRegenerate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(String(asset.content.body ?? ""));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function act(path: string) {
    setError(null);
    setBusy(path);
    try { await api.post(`/assets/${asset.id}/${path}`); onChanged(); } catch (e) { setError(e); } finally { setBusy(null); }
  }
  const score = asset.prediction?.predicted_score;
  const preview = editing ? { ...asset, content: { ...asset.content, body } } : asset;
  return (
    <article id={`asset-${asset.id}`} className={`flex flex-col gap-3 rounded-3xl border-2 bg-white p-4 text-sm transition-shadow ${asset.is_selected ? "border-brand-600 shadow-lg" : "border-[#f1e3d1] dark:border-[#292524]"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-2xl leading-none text-slate-900">Version {asset.variant}</span>
        {best && <span className="rounded-full bg-brand-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Best bet</span>}
        {asset.is_selected && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">✓ Chosen</span>}
        <span className="ml-auto"><Badge tone={statusTone(asset.status)}>{statusLabel(asset.status)}</Badge></span>
      </div>
      {typeof score === "number" && (
        <div className="flex items-center gap-2" aria-label={`Predicted score ${score} out of 100`}>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f1e3d1] dark:bg-[#292524]">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, score)}%`, backgroundImage: best ? "linear-gradient(90deg,#ea580c,#db2777)" : "linear-gradient(90deg,#fdba74,#f9a8d4)" }} />
          </div>
          <span className={`font-display text-2xl leading-none ${best ? "lm-gradient-text" : "text-slate-900"}`}>{score}</span>
          <span className="text-[11px] text-slate-500">predicted</span>
        </div>
      )}
      <PostPreview asset={preview} shopName={shopOf(campaign)} src={asset.media_url} emptyNote={mediaNote(asset)}
        onZoom={() => { if (asset.media_url) window.open(asset.media_url, "_blank", "noopener"); }} />
      {(asset.content.slide_urls ?? []).length > 1 && (
        <div className="flex gap-1 overflow-auto">{asset.content.slide_urls!.map((u, i) => <img key={i} src={u} alt={`Slide ${i + 1}`} className="h-16 rounded-lg" />)}</div>
      )}
      {asset.media_status === "failed" && <p className="text-xs text-red-700">The picture didn't come through. The copy below is still yours.</p>}
      {editing ? (
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Edit the words · the preview updates as you type</span>
          <textarea className={`${inputCls} mt-1 text-xs`} rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
      ) : (
        <details className="rounded-xl bg-[#fdf1e4] px-3 py-2 dark:bg-[#1c1917]">
          <summary className={`cursor-pointer text-xs font-semibold text-slate-700 ${focusCls}`}>All the words</summary>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-slate-800">{assetText(asset)}</pre>
        </details>
      )}
      <div className="mt-auto flex flex-wrap gap-2">
        {!asset.is_selected && <Button small disabled={busy !== null} onClick={() => act("select")}>{busy === "select" ? "Choosing…" : "Choose this version"}</Button>}
        <Button small kind="ghost" onClick={() => setEditing(!editing)}>{editing ? "Cancel" : "Edit"}</Button>
        {editing && <Button small disabled={busy === "save"} onClick={async () => {
          setBusy("save");
          try { await api.patch(`/assets/${asset.id}`, { content: { ...asset.content, body } }); setEditing(false); onChanged(); }
          catch (e) { setError(e); } finally { setBusy(null); }
        }}>{busy === "save" ? "Saving…" : "Save and re-check"}</Button>}
        <Button small kind="ghost" onClick={onRegenerate}>🔄 Regenerate with corrections</Button>
        <Button small kind="danger" disabled={busy !== null} onClick={() => act("reject")}>{busy === "reject" ? "Rejecting…" : "Reject"}</Button>
      </div>
      <ErrorNote error={error} />
    </article>
  );
}

function RegenerateDialog({
  asset,
  onClose,
  onComplete,
}: {
  asset: Asset;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [instructions, setInstructions] = useState("");
  const [allLanguages, setAllLanguages] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const QUICK_FEEDBACK = [
    "Brighter lighting & higher contrast",
    "Emphasize the discount badge prominently",
    "Make the food look crispier and more appetizing",
    "More vibrant & modern youth aesthetics",
    "Punchier, bolder headline",
    "Include local festive & cultural vibe",
  ];

  function toggleChip(chip: string) {
    if (instructions.includes(chip)) {
      setInstructions((i) =>
        i.replace(chip, "").replace(/,\s*,/g, ",").replace(/^,\s*|,\s*$/g, "").trim()
      );
    } else {
      setInstructions((i) => (i ? `${i}, ${chip}` : chip));
    }
  }

  async function handleRegenerate() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/assets/${asset.id}/regenerate`, {
        instructions: instructions.trim() || null,
        all_languages: allLanguages,
      });
      onComplete();
      onClose();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              🔄 Regenerate Ad Creative & Image
            </h3>
            <p className="text-xs text-slate-500">
              Specify what corrections or improvements you need for {FORMAT_NAMES[asset.format] ?? asset.format} ({cap(asset.platform)}).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700">
            What corrections or improvements do you need? (Optional)
          </label>
          <textarea
            className={`${inputCls} text-xs`}
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. Make the product lighting brighter, emphasize the 20% discount offer prominently, use more vibrant colors..."
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {QUICK_FEEDBACK.map((q) => {
              const isSel = instructions.includes(q);
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => toggleChip(q)}
                  className={`rounded-full px-2.5 py-1 text-xs transition-colors ${focusCls} ${
                    isSel
                      ? "bg-brand-600 font-semibold text-white shadow-sm ring-1 ring-brand-700"
                      : idleCls
                  }`}
                >
                  {isSel ? `✓ ${q}` : `+ ${q}`}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3">
          <label className="flex items-start gap-2.5 cursor-pointer text-xs">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              checked={allLanguages}
              onChange={(e) => setAllLanguages(e.target.checked)}
            />
            <div>
              <span className="font-semibold text-slate-900">
                Reflect regenerated image across all languages (English, Kannada, Hindi...)
              </span>
              <p className="text-slate-600">
                When enabled, the corrected image is synchronized across all regional language variants of this ad format.
              </p>
            </div>
          </label>
        </div>

        <ErrorNote error={error} />

        <div className="flex justify-end gap-2 pt-2">
          <Button kind="ghost" small onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button small onClick={handleRegenerate} disabled={busy}>
            {busy ? "Regenerating…" : "✨ Apply Corrections & Regenerate"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The post's words for reading, with hashtags gathered on one line instead of one per paragraph. */
function readingText(a: Asset): string {
  const c = a.content;
  const words = [c.headline, c.hook, c.body, c.cta, ...(c.slides ?? [])].filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n");
  const tags = (c.hashtags ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  return tags ? `${words}\n\n${tags}` : words;
}

function LocalizationTab({ assets }: { assets: Asset[] }) {
  const localized = assets.filter((a) => a.language !== "en" && a.is_selected);
  if (!localized.length) {
    return (
      <p className="text-sm text-slate-600">
        {`This campaign is in ${langList([...new Set(assets.map((a) => a.language))]) || "English"}. Add another language on the plan if you want a translation.`}
      </p>
    );
  }
  return (
    <div className="space-y-5">
      {localized.map((a) => {
        const score = a.content.localization?.score;
        const lang = LANGUAGES[a.language] ?? a.language;
        return (
          <article key={a.id} className="lm-card overflow-hidden rounded-3xl border bg-white">
            <header className="flex flex-wrap items-center gap-3 border-b border-[#f1e3d1] px-5 py-3 dark:border-[#292524]">
              <PlatformIcon platform={a.platform} className="h-5 w-5 text-slate-900" />
              <p className="font-display text-2xl leading-tight text-slate-900">{FORMAT_NAMES[a.format] ?? a.format} for {PLATFORM_LABELS[a.platform] ?? cap(a.platform)}</p>
              <span className="lm-glass rounded-full px-2.5 py-0.5 text-xs font-medium text-slate-800">{NATIVE_LANGUAGE[a.language] ?? lang}</span>
              {typeof score === "number" && (
                <span className="ml-auto flex items-center gap-2 text-xs text-slate-600" aria-label={`Fit ${score} out of 10`}>
                  Fit
                  <span className="flex gap-0.5" aria-hidden="true">
                    {Array.from({ length: 10 }, (_, i) => (
                      <span key={i} className={`h-3 w-1.5 rounded-full ${i < Math.round(score) ? "bg-brand-600" : "bg-[#f1e3d1] dark:bg-[#292524]"}`} />
                    ))}
                  </span>
                  <span className="font-display text-xl leading-none text-slate-900">{Number(score).toFixed(1)}</span>
                </span>
              )}
            </header>
            <div className="grid md:grid-cols-2">
              <div className="bg-[#fffaf3] p-5 dark:bg-[#141210]">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">In {lang}</p>
                <p lang={a.language} className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-slate-900">{readingText(a)}</p>
              </div>
              <div className="border-t border-[#f1e3d1] p-5 md:border-l md:border-t-0 dark:border-[#292524]">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Back in English</p>
                <p className="mt-2 whitespace-pre-wrap text-sm italic leading-relaxed text-slate-600">{a.content.localization?.back_translation || "—"}</p>
              </div>
            </div>
            {a.cultural_notes && (
              <div className="flex gap-3 border-t border-[#f1e3d1] bg-amber-50 px-5 py-3 text-sm text-amber-800 dark:border-[#292524]">
                <BulbIcon className="mt-0.5 h-5 w-5 shrink-0" />
                <p><b>Cultural note.</b> {a.cultural_notes}</p>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function PerformanceTab({ campaign }: { campaign: CampaignT }) {
  const s = campaign.summary;
  const selected = (campaign.assets ?? []).filter((a) => a.is_selected && a.prediction?.predicted_score);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ScoreRing label="Predicted impact" value={s?.predicted_impact} />
        <ScoreRing label="Platform fit" value={s?.platform_fit} />
        <ScoreRing label="Local relevance" value={s?.local_relevance} />
        <ScoreRing label="Pieces ready" value={s?.verified ?? null}
          max={Math.max(1, (s?.verified ?? 0) + (s?.failed ?? 0) + (s?.stale ?? 0))} />
      </div>
      <p className="flex gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <BulbIcon className="h-5 w-5 shrink-0" />
        These are estimates made before publishing, not measured results. Results show the numbers from the platforms after something is published.
      </p>
      {selected.length > 0 && (
        <Panel eyebrow="Predicted" title="Which post should do best"
          aside={<span className="text-sm text-slate-600">{offerLine(campaign.brain.brief, campaign.brain.offer)} · {productOf(campaign)}</span>}>
          <RankBars items={selected.map((a) => ({
            id: a.id,
            label: `${PLATFORM_LABELS[a.platform] ?? cap(a.platform)} ${(FORMAT_NAMES[a.format] ?? a.format).toLowerCase()}`,
            sub: `${LANGUAGES[a.language] ?? a.language} · version ${a.variant}`,
            value: a.prediction.predicted_score ?? 0,
            thumb: a.media_url,
            platform: a.platform,
          }))} />
        </Panel>
      )}
    </div>
  );
}

function canTick(asset: Asset): boolean {
  if (asset.status === "approved" || asset.status === "rejected") return false;
  return asset.status !== "stale" && asset.status !== "draft";
}

function postTitle(asset: Asset): string {
  const headline = asset.content.headline || (asset.format === "message" ? String(asset.content.body ?? "").split("\n")[0] : "");
  return headline || FORMAT_NAMES[asset.format] || asset.format;
}

function ApprovalTab({ campaign, onChanged, onApproved }: { campaign: CampaignT; onChanged: () => void; onApproved: () => void }) {
  const posts = (campaign.assets ?? []).filter((a) => a.is_selected && a.status !== "rejected");
  const readyKey = posts.filter(canTick).map((a) => a.id).join(",");
  const [pickedKey, setPickedKey] = useState(readyKey);
  const [picked, setPicked] = useState<string[]>(() => readyKey.split(",").filter(Boolean));
  if (pickedKey !== readyKey) {
    setPickedKey(readyKey);
    setPicked(readyKey.split(",").filter(Boolean));
  }
  const readyIds = readyKey.split(",").filter(Boolean);
  const allOn = readyIds.length > 0 && readyIds.every((id) => picked.includes(id));
  const [discount, setDiscount] = useState(campaign.brain.offer.discount ?? "");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<"approve" | "facts" | null>(null);
  const canApprove = ["review", "approved", "publishing", "published"].includes(campaign.status);
  async function changeFacts() {
    setError(null);
    setBusy("facts");
    try { await api.patch(`/campaigns/${campaign.id}/facts`, { offer: { discount } }); onChanged(); }
    catch (e) { setError(e); } finally { setBusy(null); }
  }
  async function approve() {
    setError(null);
    setBusy("approve");
    try {
      await api.post(`/campaigns/${campaign.id}/approve`, { asset_ids: picked });
      fireConfetti();
      onChanged();
      onApproved();
    } catch (e) { setError(e); } finally { setBusy(null); }
  }
  const s = campaign.summary;
  const approval = campaign.brain.approval;
  const platforms = campaign.brain.strategy?.platforms ?? [];
  const languages = campaign.brain.strategy?.languages ?? [];
  const brief = campaign.brain.brief;
  const [editingDeal, setEditingDeal] = useState(false);
  const factTiles = [
    ...(brief?.product ? [{ label: "Promoting", value: brief.product }] : []),
    ...factRows(campaign.brain.offer).filter((r) => r.label !== "Deal" && !(r.label === "Product" && r.value === brief?.product)),
    ...(brief?.highlights ? [{ label: "Special", value: brief.highlights }] : []),
  ];
  return (
    <div className="space-y-6">
      <section id="approve-posts" className="lm-card rounded-3xl border bg-white p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">Approve</p>
            <h2 className="font-display text-3xl leading-tight text-slate-900">Pick what goes out</h2>
          </div>
          {readyIds.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="font-display text-2xl text-slate-900">{picked.length}<span className="text-base text-slate-500">/{readyIds.length}</span></span>
              <button type="button" aria-pressed={allOn} onClick={() => setPicked(allOn ? [] : readyIds)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${focusCls} ${allOn ? "lm-cta text-white" : "lm-glass text-slate-700"}`}>
                {allOn ? "✓ All picked" : "Pick all"}
              </button>
            </div>
          )}
        </div>
        {posts.length === 0 && <p className="text-sm text-slate-600">Posts show up here once the creatives are ready.</p>}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {posts.map((asset) => {
            const open = canTick(asset);
            const checked = asset.status === "approved" || picked.includes(asset.id);
            const thumb = asset.media_url || asset.content.slide_urls?.[0];
            const name = PLATFORM_LABELS[asset.platform] ?? cap(asset.platform);
            return (
              <li key={asset.id}>
                <label className={`group relative block h-full overflow-hidden rounded-2xl border-2 bg-white transition duration-200 motion-reduce:transition-none ${
                  checked ? "border-brand-600 shadow-md" : "border-[#f1e3d1] dark:border-[#292524]"} ${open ? "cursor-pointer hover:-translate-y-0.5" : ""}`}>
                  <div className="relative aspect-square bg-[#fdf1e4] dark:bg-[#1c1917]">
                    <Img src={thumb ?? undefined} alt="" className="h-full w-full object-contain"
                      fallback={<div className="flex h-full items-center justify-center p-4 text-center font-display text-2xl leading-tight text-[#ffffff]" style={{ backgroundImage: LOOP_GRADIENT }}>{postTitle(asset)}</div>} />
                    <span className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full shadow ${checked ? "bg-brand-700 text-white" : "bg-[#ffffff]/90 text-transparent ring-1 ring-[#e7d8c6]"}`}>
                      <svg aria-hidden="true" viewBox="0 0 10 10" className="h-3.5 w-3.5"><path d="M1.8 5.2 4 7.3 8.3 2.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                    <input type="checkbox" className="sr-only" checked={checked} disabled={!open} aria-label={`Approve ${postTitle(asset)}, ${name}`}
                      onChange={() => setPicked((cur) => cur.includes(asset.id) ? cur.filter((id) => id !== asset.id) : [...cur, asset.id])} />
                  </div>
                  <span className="block space-y-1.5 p-3">
                    <span className="flex items-center gap-1.5 text-xs text-slate-600">
                      <PlatformIcon platform={asset.platform} className="h-4 w-4 shrink-0 text-slate-900" />
                      <span className="truncate">{FORMAT_NAMES[asset.format] ?? asset.format} · {NATIVE_LANGUAGE[asset.language] ?? LANGUAGES[asset.language] ?? asset.language}{asset.variant ? ` · ${asset.variant}` : ""}</span>
                    </span>
                    <span className="block truncate text-sm font-medium text-slate-900" title={postTitle(asset)}>{postTitle(asset)}</span>
                    <Badge tone={statusTone(asset.status)}>{statusLabel(asset.status)}</Badge>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {canApprove && readyIds.length > 0 && (
          <div className="mt-5">
            <Button disabled={busy !== null || picked.length === 0} onClick={approve}>
              {busy === "approve" ? "Approving…" : `Approve ${picked.length} ${picked.length === 1 ? "post" : "posts"}`}
            </Button>
          </div>
        )}
        <ErrorNote error={error} />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Panel eyebrow="Readiness" title="Ready to go?">
          <ReadinessDonut verified={s?.verified ?? 0} failed={s?.failed ?? 0} stale={s?.stale ?? 0}
            total={s?.selected_assets || (s?.verified ?? 0) + (s?.failed ?? 0) + (s?.stale ?? 0)} />
          <div className="mt-6">
            <ApprovalTrail steps={[
              { label: "Written", done: (s?.verified ?? 0) > 0 },
              { label: "Approved", done: approval.status === "approved", note: approval.by ? `by ${approval.by}` : undefined },
              { label: "Out", done: campaign.status === "published" },
            ]} />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-1.5 border-t border-[#f1e3d1] pt-4 dark:border-[#292524]">
            {platforms.map((p) => (
              <span key={p} className="lm-glass inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-slate-800" title={PLATFORM_LABELS[p] ?? p}>
                <PlatformIcon platform={p} className="h-3.5 w-3.5 text-slate-900" />{PLATFORM_LABELS[p] ?? cap(p)}
              </span>
            ))}
            {languages.map((l) => <span key={l} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700" title={LANGUAGES[l] ?? l}>{NATIVE_LANGUAGE[l] ?? LANGUAGES[l] ?? l}</span>)}
          </div>
        </Panel>

        <Panel eyebrow="Locked" title="Your facts"
          aside={<InfoTip label="Every post is checked">LOOPLY checks every price, date and claim in every post against these. Changing the deal starts a new version and rewrites only the posts that use it.</InfoTip>}>
          <div className="rounded-2xl p-4 text-[#ffffff]" style={{ backgroundImage: "linear-gradient(110deg,#c2410c,#be185d)" }}>
            <div className="flex items-start justify-between gap-3">
              <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[#ffffff]/80"><LockIcon />Deal</p>
              {!editingDeal && (
                <button type="button" onClick={() => setEditingDeal(true)} className={`rounded-lg bg-[#ffffff]/20 px-2 py-0.5 text-xs font-semibold text-[#ffffff] hover:bg-[#ffffff]/30 ${focusCls}`}>✎ Change</button>
              )}
            </div>
            {editingDeal ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input aria-label="Discount" autoFocus className="min-w-0 flex-1 rounded-xl bg-[#ffffff] px-3 py-2 text-sm text-[#0f172a] outline-none" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                <button type="button" disabled={busy !== null} onClick={async () => { await changeFacts(); setEditingDeal(false); }}
                  className={`rounded-xl bg-[#ffffff] px-3 py-2 text-sm font-semibold text-[#c2410c] ${focusCls}`}>{busy === "facts" ? "Applying…" : "Apply"}</button>
                <button type="button" onClick={() => { setEditingDeal(false); setDiscount(campaign.brain.offer.discount ?? ""); }}
                  className={`rounded-xl px-2 py-2 text-sm text-[#ffffff]/90 ${focusCls}`}>Cancel</button>
              </div>
            ) : (
              <p className="mt-1 font-display text-3xl leading-tight">{displayOffer(campaign.brain.offer.discount || brief?.offer || "") || "No deal"}</p>
            )}
          </div>
          <div className="mt-3"><FactTiles rows={factTiles} /></div>
          {(campaign.brain.files ?? []).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(campaign.brain.files ?? []).map((f) => <span key={f.url} className="lm-glass rounded-full px-3 py-1 text-xs font-medium text-slate-800">📎 {f.filename}</span>)}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function jobNote(job: import("../lib/types").PublishJob, connected: SocialAccount[]): string {
  if (!job.error) return "";
  const live = connected.some((a) => a.target_platform === job.platform);
  if (live && /disconnect/i.test(job.error)) return ` — ${job.platform} is connected. Press Retry to send this post there.`;
  return ` — ${job.error}`;
}

function PublishingTab({ campaign, notice, onGoto, onEdit }: { campaign: CampaignT; notice: string; onGoto: (tab: Tab) => void; onEdit: (asset: Asset) => void }) {
  const qc = useQueryClient();
  const jobs = useQuery({ queryKey: ["jobs", campaign.id], queryFn: () => api.get<import("../lib/types").PublishJob[]>(`/campaigns/${campaign.id}/publish-jobs`), refetchInterval: 4000 });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => api.get<SocialAccount[]>("/social/accounts") });
  const [when, setWhen] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const posts = (campaign.assets ?? []).filter((a) => a.is_selected && a.status !== "rejected");
  const [sourceId, setSourceId] = useState(posts[0]?.id ?? "");
  const source = posts.find((a) => a.id === sourceId) ?? posts[0];
  const [target, setTarget] = useState("youtube");
  const [reuseBusy, setReuseBusy] = useState<string | null>(null);
  const [reuseError, setReuseError] = useState<unknown>(null);
  const [reuseNote, setReuseNote] = useState("");
  const approved = ["approved", "publishing", "published"].includes(campaign.status);
  const connected = accounts.data ?? [];
  async function sendElsewhere() {
    if (!source) return;
    setReuseError(null);
    setReuseNote("");
    setReuseBusy("send");
    try {
      const created = await api.post<Asset>(`/assets/${source.id}/reuse`, { mode: "another_platform", platform: target });
      const account = connected.find((a) => a.target_platform === target);
      if (account) {
        await api.post(`/campaigns/${campaign.id}/publish`, { items: [{ asset_id: created.id, social_account_id: account.id }] });
        setReuseNote(`The same picture is on its way to ${PLATFORM_LABELS[target] ?? target}.`);
      } else {
        setReuseNote(`${PLATFORM_LABELS[target] ?? target} has this picture and caption. Connect that account, then press Publish.`);
      }
      await qc.invalidateQueries({ queryKey: ["campaign", campaign.id] });
      qc.invalidateQueries({ queryKey: ["jobs", campaign.id] });
    } catch (e) { setReuseError(e); } finally { setReuseBusy(null); }
  }
  async function postAgain() {
    if (!source) return;
    setReuseError(null);
    setReuseNote("");
    const account = connected.find((a) => a.target_platform === source.platform);
    if (!account) {
      setReuseError(new Error(`Connect ${PLATFORM_LABELS[source.platform] ?? source.platform} on Accounts, then post again.`));
      return;
    }
    setReuseBusy("again");
    try {
      await api.post(`/campaigns/${campaign.id}/publish`, { repost: true, items: [{ asset_id: source.id, social_account_id: account.id }] });
      qc.invalidateQueries({ queryKey: ["jobs", campaign.id] });
      setReuseNote("Posted again with the current picture and words.");
    } catch (e) { setReuseError(e); } finally { setReuseBusy(null); }
  }
  async function makeVersion() {
    if (!source) return;
    setReuseError(null);
    setReuseBusy("create");
    try {
      const created = await api.post<Asset>(`/assets/${source.id}/reuse`, { mode: "create" });
      await qc.invalidateQueries({ queryKey: ["campaign", campaign.id] });
      onEdit(created);
    } catch (e) { setReuseError(e); } finally { setReuseBusy(null); }
  }
  async function publish() {
    setError(null);
    setBusy(true);
    try {
      await api.post(`/campaigns/${campaign.id}/publish`, { scheduled_at: when ? new Date(when).toISOString() : null });
      fireConfetti();
      qc.invalidateQueries({ queryKey: ["jobs", campaign.id] });
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  const jobList = jobs.data ?? [];
  const [allJobs, setAllJobs] = useState(false);
  const jobCounts = jobList.reduce<Record<string, number>>((m, j) => ({ ...m, [j.status]: (m[j.status] ?? 0) + 1 }), {});
  const beam = approved && connected.length > 0 && jobList.length === 0;
  const pad = (
    <div className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <IconTile><RocketIcon /></IconTile>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">Launch pad</p>
          <p className="font-display text-3xl leading-tight text-slate-900">Send {productOf(campaign)} out</p>
        </div>
      </div>
      {accounts.isLoading && <p className="mt-4 text-sm text-slate-600">Loading accounts</p>}
      {accounts.isError && <div className="mt-4"><ErrorNote error={new Error("Couldn't load this. Try again.")} /></div>}
      {!accounts.isLoading && !accounts.isError && connected.length === 0 && (
        <p className="mt-4 text-sm">Connect an account first, or <Link className="text-brand-700 underline" to="/accounts">add a simulated one</Link>. Simulated posts are labelled and never go live.</p>
      )}
      {connected.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-slate-600">Goes to</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {connected.map((a) => (
              <span key={a.id} className="lm-glass inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm text-slate-800">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm"><PlatformIcon platform={a.target_platform} className="h-4 w-4 text-slate-900" /></span>
                {a.display_name}
                {a.simulated && <Badge tone="amber">Simulated</Badge>}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-600">
          Schedule (optional)
          <input type="datetime-local" className={`${fieldCls} mt-1 block`} value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <button type="button" onClick={publish} disabled={!approved || busy || connected.length === 0}
          className={`lm-cta inline-flex items-center gap-2 rounded-xl px-6 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-600 ${focusCls}`}>
          {busy ? "Publishing…" : `Publish ${when ? "at scheduled time" : "now"}`} <span aria-hidden="true">→</span>
        </button>
      </div>
      {!approved && (
        <p className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Publishing stays off until you approve.
          <Button kind="ghost" small onClick={() => onGoto("approval")}>Go to Approve</Button>
        </p>
      )}
      <div className="mt-3"><ErrorNote error={error} /></div>
    </div>
  );
  return (
    <div className="space-y-6">
      {notice && <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><span aria-hidden="true">✓</span>{notice}</p>}
      {beam
        ? <BorderBeam radius="rounded-3xl">{pad}</BorderBeam>
        : <div className="lm-card rounded-3xl border bg-white">{pad}</div>}

      {jobList.length > 0 && (
        <Panel eyebrow="On its way" title="Where each post is"
          aside={(
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(jobCounts).map(([st, n]) => <Badge key={st} tone={statusTone(st)}>{n} {statusLabel(st).toLowerCase()}</Badge>)}
            </div>
          )}>
          <ul className="space-y-2">
            {(allJobs ? jobList : jobList.slice(0, 5)).map((j) => {
              const live = ["queued", "sending", "publishing"].includes(j.status);
              return (
                <li key={j.id} className="lm-glass flex flex-wrap items-center gap-3 rounded-2xl px-3 py-2.5 text-sm">
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                    {live && <span aria-hidden="true" className="lm-pulse-ring absolute inset-0 rounded-xl bg-brand-400" />}
                    <PlatformIcon platform={j.platform} className="relative h-5 w-5 text-slate-900" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{PLATFORM_LABELS[j.platform] ?? cap(j.platform)} {j.simulated && <Badge tone="amber">Simulated</Badge>}</p>
                    <p className="truncate text-xs text-slate-600">
                      {j.result?.url ? <a className="underline" href={j.result.url} target="_blank" rel="noreferrer">{j.result.url}</a> : j.external_post_id || ""}{jobNote(j, connected)}
                    </p>
                  </div>
                  <Badge tone={statusTone(j.status)}>{statusLabel(j.status)}</Badge>
                  {j.status === "failed" && <Button small kind="ghost" onClick={async () => { await api.post(`/publish-jobs/${j.id}/retry`); qc.invalidateQueries({ queryKey: ["jobs", campaign.id] }); }}>Retry</Button>}
                  {["queued", "scheduled"].includes(j.status) && <Button small kind="danger" onClick={async () => { await api.post(`/publish-jobs/${j.id}/cancel`); qc.invalidateQueries({ queryKey: ["jobs", campaign.id] }); }}>Cancel</Button>}
                </li>
              );
            })}
          </ul>
          {jobList.length > 5 && (
            <button type="button" onClick={() => setAllJobs(!allJobs)} aria-expanded={allJobs}
              className={`mt-3 text-sm font-semibold text-brand-700 ${focusCls}`}>
              {allJobs ? "Show fewer" : `Show all ${jobList.length}`}
            </button>
          )}
        </Panel>
      )}

      {approved && source && (
        <Panel eyebrow="Get more from it" title="Use this post again">
          <div className="grid gap-5 md:grid-cols-[11rem_minmax(0,1fr)]">
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl shadow-md" style={{ backgroundImage: LOOP_GRADIENT }}>
              <Img src={source.media_url ?? undefined} alt="" className="h-full w-full object-cover"
                fallback={<span className="flex h-full items-center justify-center p-3 text-center font-display text-xl leading-tight text-[#ffffff]">{postTitle(source)}</span>} />
            </div>
            <div className="space-y-3 text-sm">
              <p className="text-slate-600">Send the same picture and words to YouTube, X, or another platform. Edit this post and post it again, or start a new version.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-slate-600">
                  Post
                  <select className={`${fieldCls} mt-1 block w-full`} value={source.id} onChange={(e) => setSourceId(e.target.value)}>
                    {posts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {(a.content.headline || FORMAT_NAMES[a.format] || a.format)} · {PLATFORM_LABELS[a.platform] ?? a.platform} · {LANGUAGES[a.language] ?? a.language}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-slate-600">
                  Also post on
                  <select className={`${fieldCls} mt-1 block w-full`} value={target} onChange={(e) => setTarget(e.target.value)}>
                    {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={reuseBusy !== null} onClick={sendElsewhere}>{reuseBusy === "send" ? "Sending…" : "Post this picture there"}</Button>
                <Button kind="ghost" disabled={reuseBusy !== null} onClick={() => onEdit(source)}>Edit this post</Button>
                <Button kind="ghost" disabled={reuseBusy !== null} onClick={postAgain}>{reuseBusy === "again" ? "Posting…" : "Post again"}</Button>
                <Button kind="ghost" disabled={reuseBusy !== null} onClick={makeVersion}>{reuseBusy === "create" ? "Creating…" : "Create a new version"}</Button>
              </div>
              {reuseNote && <p className="text-sm text-emerald-800">{reuseNote}</p>}
              <ErrorNote error={reuseError} />
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

function RocketIcon() {
  return <svg viewBox="0 0 20 20" className="h-5 w-5"><path d="M10.5 3.6c3-1.3 5.4-1.2 6-.6s.7 3-.6 6L12.5 12.5l-5-5zM7.5 7.5 4.6 8 3 10.4l3 .6M12.5 12.5 12 15.4 9.6 17 9 14M7 13l-2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** The AI's pre-publish score for a post: its impact score, or the mean of the fit scores it did give. */
function predictedOf(r: import("../lib/types").AnalyticsRow) {
  const p = (r.ai_predicted ?? {}) as Record<string, number | undefined>;
  if (typeof p.predicted_impact === "number") return Math.round(p.predicted_impact);
  if (typeof p.predicted_score === "number") return Math.round(p.predicted_score);
  const parts = [p.platform_fit, p.local_relevance].filter((v): v is number => typeof v === "number");
  return parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 0;
}

function compact(n: number) {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function AnalyticsTab({ campaign }: { campaign: CampaignT }) {
  const qc = useQueryClient();
  const data = useQuery({
    queryKey: ["analytics", campaign.id],
    queryFn: () => api.get<{ rows: import("../lib/types").AnalyticsRow[]; report: import("../lib/types").AnalyticsReport | null }>(`/campaigns/${campaign.id}/analytics`),
  });
  const [refreshing, setRefreshing] = useState(false);
  const report = data.data?.report;
  const rows = data.data?.rows ?? [];
  const published = ["publishing", "published"].includes(campaign.status);
  const num = (r: import("../lib/types").AnalyticsRow, k: string) => (typeof r.metrics[k] === "number" ? (r.metrics[k] as number) : null);
  const sum = (k: string) => rows.reduce((t, r) => t + (num(r, k) ?? 0), 0);
  const avg = (k: string) => {
    const vals = rows.map((r) => num(r, k)).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  const simulated = rows.some((r) => r.simulated);
  const metricKeys = [...new Set(rows.flatMap((r) => Object.keys(r.metrics).filter((k) => k !== "simulated" && typeof r.metrics[k] === "number")))];
  const learnings = report?.learnings ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {simulated ? <Badge tone="amber">Simulated numbers</Badge> : <span />}
        <button type="button" disabled={refreshing} className={`lm-glass inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-slate-800 ${focusCls}`}
          onClick={async () => {
            setRefreshing(true);
            try { await api.post(`/campaigns/${campaign.id}/analytics/refresh`); } finally {
              setTimeout(() => { qc.invalidateQueries({ queryKey: ["analytics", campaign.id] }); setRefreshing(false); }, 1500);
            }
          }}>
          <svg aria-hidden="true" viewBox="0 0 16 16" className={`h-4 w-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`}><path d="M13 8a5 5 0 1 1-1.5-3.5M13 3v2.5h-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {refreshing ? "Refreshing…" : "Refresh from platforms"}
        </button>
      </div>
      {data.isError && <ErrorNote error={new Error("Couldn't load this. Try again.")} />}

      {report && (
        <section className="lm-card relative overflow-hidden rounded-3xl border bg-white">
          <Aurora tone="quiet" />
          <div className="relative p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">What happened</p>
            <div className="mt-2 max-w-4xl">
              <ExpandableText text={report.summary} lines={3}
                className={`font-display italic leading-snug text-slate-900 ${report.summary.length > 220 ? "text-2xl" : "text-3xl"}`} />
            </div>
            {report.prediction_accuracy && <p className="mt-3 text-sm text-slate-600">{report.prediction_accuracy}</p>}
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <MetricTiles metrics={[
          { label: "Reach", value: Math.round(sum("reach")), hint: "people who saw it" },
          { label: "Views", value: Math.round(sum("views")) },
          { label: "Clicks", value: Math.round(sum("clicks")) },
          { label: "Click rate", value: avg("ctr"), suffix: "%" },
          { label: "Engagement", value: avg("engagement_rate"), suffix: "%" },
        ]} />
      )}

      {rows.length > 0 && (
        <Panel eyebrow="Prediction check" title="What we expected, and what happened">
          <PredictedVsActual rows={rows.map((r) => ({
            id: r.asset_id + r.platform,
            label: `${PLATFORM_LABELS[r.platform] ?? cap(r.platform)} ${(FORMAT_NAMES[r.format] ?? r.format).toLowerCase()} · ${LANGUAGES[r.language] ?? r.language}`,
            platform: r.platform,
            predicted: predictedOf(r),
            actual: num(r, "reach") ?? 0,
            actualLabel: num(r, "reach") !== null ? `${compact(num(r, "reach")!)} reach` : "—",
          }))} />
          <details className="mt-5">
            <summary className={`cursor-pointer text-sm font-semibold text-slate-700 ${focusCls}`}>Every number, post by post</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-xs">
                <thead className="text-slate-500">
                  <tr><th className="py-1.5 pr-3 font-medium">Post</th>{metricKeys.map((k) => <th key={k} className="py-1.5 pr-3 font-medium capitalize">{k.replaceAll("_", " ")}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.asset_id + r.platform} className="border-t border-[#f1e3d1] dark:border-[#292524]">
                      <td className="py-1.5 pr-3 capitalize text-slate-800">{r.platform} {r.format} · {LANGUAGES[r.language] ?? r.language} {r.simulated && <Badge tone="amber">Simulated</Badge>}</td>
                      {metricKeys.map((k) => <td key={k} className="py-1.5 pr-3 tabular-nums text-slate-900">{num(r, k) ?? "—"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Panel>
      )}

      {learnings.length > 0 && (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">Learnings</p>
            <h2 className="font-display text-3xl leading-tight text-slate-900">Use this next time</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {learnings.map((l, i) => (
              <article key={l.id ?? i} className="lm-card flex flex-col gap-2 rounded-3xl border bg-white p-5">
                <IconTile><BulbIcon /></IconTile>
                <p className="font-display text-2xl leading-tight text-slate-900">{l.insight}</p>
                {l.evidence && <p className="text-xs text-slate-600"><b className="text-slate-700">Evidence: </b>{l.evidence}</p>}
                {l.recommendation && <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-slate-800"><b className="text-brand-700">Next time: </b>{l.recommendation}</p>}
                {l.id && <Link to={`/campaigns/new?learning=${l.id}`} className={`mt-auto self-start text-sm font-semibold text-brand-700 ${focusCls}`}>Use it in a new campaign →</Link>}
              </article>
            ))}
          </div>
        </div>
      )}

      {data.data && !rows.length && (
        <p className="text-sm text-slate-600">
          {published
            ? "Published. Platform numbers usually take a little while. Refresh from platforms when you want to check."
            : "Results show up after something is published. Until then, Predictions is an estimate, not a result."}
        </p>
      )}
    </div>
  );
}

/** "For everyone" and "everyone" read the same after the "For" prefix we add. */
function audienceText(audience: string) {
  return audience.replace(/^for\s+/i, "");
}

function PeopleIcon() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0"><circle cx="6" cy="5.5" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M1.8 13.5c.5-2.3 2.2-3.6 4.2-3.6s3.7 1.3 4.2 3.6M10.8 3.6a2.2 2.2 0 0 1 0 4.2M12.2 9.9c1.1.5 1.9 1.6 2.1 3.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
}
