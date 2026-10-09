import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import LocalityMap from "../components/LocalityMap";
import { api } from "../lib/api";
import { displayOffer } from "../lib/offer";
import { useCampaignStream } from "../lib/stream";
import { Asset, Business, Campaign as CampaignT, LANGUAGES, PLATFORM_LABELS, PLATFORMS, SocialAccount } from "../lib/types";
import { Badge, Button, Card, DocumentTitle, ErrorNote, Field, fieldCls, focusCls, idleCls, inputCls, selectedCls, Spinner, statusTone, Stepper } from "../lib/ui";

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

const STAGE_COPY: Record<string, string> = {
  intake: "Starting the campaign.",
  research: "Finding nearby colleges, offices, and transit.",
  strategy: "Picking the best platforms and formats for your goal.",
  copy: "Writing the captions and headlines.",
  localization: "Translating into the languages you chose.",
  truth: "Checking every line against your facts.",
  performance: "Estimating how this might perform.",
  media: "Drawing the creatives.",
  review: "Finishing the draft.",
};

type Focus = { platform: string; language: string; assetId: string };

export default function CampaignPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => api.get<CampaignT>(`/campaigns/${id}`),
    refetchInterval: (query) => (query.state.data?.status === "generating" ? 2500 : false),
  });
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => api.get<Business[]>("/businesses") });
  const c = q.data;
  const live = useCampaignStream(id, c?.status === "generating");
  const [picked, setTab] = useState<Tab | null>(null);
  const [contentFocus, setContentFocus] = useState<Focus | null>(null);
  const [notice, setNotice] = useState("");
  const [regenAsset, setRegenAsset] = useState<Asset | null>(null);
  const [stepError, setStepError] = useState<unknown>(null);
  const [stepBusy, setStepBusy] = useState(false);

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
  const stageLine = `Writing ${product} for ${shopName}${languages.length ? ` in ${langList(languages)}` : ""}.`;

  function openCopy(asset: Asset) {
    setContentFocus({ platform: asset.platform, language: asset.language, assetId: asset.id });
    setTab("content");
  }

  function openApproval() {
    setTab("approval");
    window.setTimeout(() => document.getElementById("approve-posts")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const place = [shop?.category, shop?.city].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <DocumentTitle title={c.title} />
      <div>
        <p className="text-sm text-slate-600">{shopName}{place ? ` · ${place}` : ""}</p>
        <h1 className="text-2xl font-bold">{c.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{deal}{audience ? ` · ${audience}` : ""}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
          {platforms.map((p) => <Badge key={p}>{cap(p)}</Badge>)}
          {languages.map((l) => <Badge key={l}>{LANGUAGES[l] ?? l}</Badge>)}
        </div>
      </div>

      {status === "generating" && (
        <Card>
          <p role="status" className="flex items-center gap-2 text-sm font-medium"><Spinner /> {stageLine}</p>
          <p className="mt-1 text-xs text-slate-600">{STAGE_COPY[c.stage ?? ""] ?? "You can leave this page. The campaign keeps going."}</p>
          <details className="mt-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">What we're doing</summary>
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
              {live.events.slice(-12).map((e) => (
                <li key={e.seq}>{e.message} <span className="text-slate-500">{e.agent}</span></li>
              ))}
              {live.events.length === 0 && <li>Starting. You can leave this page; the campaign keeps going.</li>}
            </ul>
          </details>
        </Card>
      )}

      {c.brain.clarifying_questions?.length > 0 && status === "clarifying" && <Clarify campaign={c} />}

      {step && status !== "generating" && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">{step.title}</p>
            <p className="text-sm text-slate-600">{step.detail}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => {
                if (step.tab === "content" && broken) openCopy(broken);
                else if (step.tab === "approval") openApproval();
                else setTab(step.tab);
              }}>{step.action}</Button>
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
            <ErrorNote error={stepError} />
          </div>
        </Card>
      )}

      <Stepper steps={["Plan", "Your posts", "Approve", "Publish"]} step={stage} onJump={(i) => setTab(STAGE_TABS[i][0])} />

      <div role="tablist" aria-label="Campaign sections" className="flex flex-wrap gap-1 border-b border-slate-200 text-sm">
        {STAGE_TABS[stage].map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`-mb-px rounded-t-lg px-3 py-2 ${focusCls} ${tab === t ? "border border-b-white border-slate-200 bg-white font-semibold text-brand-700" : "text-slate-600 hover:text-slate-800"}`}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "creatives" && (
          <CreativesTab assets={assets} generating={status === "generating"} awaitingPlan={status === "strategy_review"}
            product={product} languageLine={langList(languages) || "the languages you chose"} onOpen={openCopy} onRegenerate={setRegenAsset} />
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
  return null;
}

function Clarify({ campaign }: { campaign: CampaignT }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const send = useMutation({
    mutationFn: () => api.post(`/campaigns/${campaign.id}/messages`, { message: text }),
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
    <Card className="space-y-3 border-amber-300">
      <div className="text-sm font-medium">One detail about {productOf(campaign) || shopOf(campaign)} is missing.</div>
      <ul className="list-disc pl-5 text-sm">{campaign.brain.clarifying_questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
      
      <div>
        <div className="mb-1 text-xs font-medium text-slate-600">Quick options (click multiple to build your answer):</div>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => {
            const isSel = text.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSuggestion(s)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${focusCls} ${
                  isSel
                    ? "bg-brand-600 font-semibold text-white shadow-sm ring-1 ring-brand-700"
                    : idleCls
                }`}
              >
                {isSel ? `✓ ${s}` : `+ ${s}`}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input className={`${inputCls} min-w-0 flex-1`} value={text}
          onChange={(e) => setText(e.target.value)} placeholder="Your answer or additional details"
          onKeyDown={(e) => { if (e.key === "Enter" && text && !send.isPending) send.mutate(); }} />
        <Button onClick={() => send.mutate()} disabled={!text || send.isPending}>{send.isPending ? "Sending…" : "Send"}</Button>
      </div>
      {send.isPending && <p className="text-xs text-slate-600">Answer received. Planning continues in a moment.</p>}
      <ErrorNote error={send.error} />
    </Card>
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
  const ready = campaign.status === "strategy_review";

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
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-3 text-sm">
        <h2 className="font-semibold">Plan for {name}</h2>
        <p>{s.objective || brief?.goal || "This campaign"} for {s.primary_audience || brief?.audience || "your customers"}. {offerLine(brief, offer)}.</p>
        <div className="flex flex-wrap gap-1">
          {s.platforms.map((p) => <Badge key={p}>{cap(p)}</Badge>)}
          {Object.entries(s.formats).flatMap(([p, fs]) => fs.map((f) => (
            <Badge key={`${p}-${f}`}>{FORMAT_NAMES[f] ?? f}</Badge>
          )))}
        </div>

        <div className="space-y-1.5">
          <Field label="Tone (Select multiple or type)">
            <input className={inputCls} value={tone} onChange={(e) => setTone(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {TONES.map((t) => {
              const isSel = (tone || "").includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTone(t)}
                  className={`rounded-full px-2.5 py-1 text-xs transition-colors ${focusCls} ${
                    isSel ? "bg-brand-600 font-semibold text-white shadow-sm ring-1 ring-brand-700" : idleCls
                  }`}
                >
                  {isSel ? `✓ ${t}` : `+ ${t}`}
                </button>
              );
            })}
          </div>
        </div>

        {/* Translation and code-switching style option */}
        <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
          <div className="text-xs font-semibold text-slate-800">Translation & Localization Style</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => { setCodeSwitching(true); setCodeSwitchingStyle("kanglish_hinglish"); }}
              className={`rounded-lg border p-2 text-left text-xs transition-colors ${
                codeSwitching ? "border-brand-600 bg-brand-50/70 font-medium text-brand-900 ring-1 ring-brand-600" : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <div className="font-semibold">⚡ Kanglish / Hinglish / Tanglish</div>
              <div className="text-[11px] text-slate-500">Conversational code-switching with natural English loanwords</div>
            </button>
            <button
              type="button"
              onClick={() => { setCodeSwitching(false); setCodeSwitchingStyle("native_pure"); }}
              className={`rounded-lg border p-2 text-left text-xs transition-colors ${
                !codeSwitching ? "border-brand-600 bg-brand-50/70 font-medium text-brand-900 ring-1 ring-brand-600" : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <div className="font-semibold">📖 Pure Native Script</div>
              <div className="text-[11px] text-slate-500">Authentic literary native script without English loanwords</div>
            </button>
          </div>
        </div>

        <div>
          <div className="mb-1 text-sm font-medium text-slate-700">Languages (Select all that apply)</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(LANGUAGES).map(([code, name]) => (
              <button key={code} type="button" onClick={() => toggleLang(code)}
                className={`rounded-lg px-2.5 py-1 text-xs ${focusCls} ${langs.includes(code) ? selectedCls : idleCls}`}>{name}</button>
            ))}
          </div>
        </div>

        {(s.rationale || s.posting_schedule.length > 0) && <p className="text-sm text-slate-600">Why this plan</p>}
        {s.rationale && <p className="text-slate-600">{s.rationale}</p>}
        <div className="text-xs text-slate-600">{s.posting_schedule.map((sl, i) => <div key={i}>{cap(sl.platform)}: {sl.day} {sl.time} — {sl.reason}</div>)}</div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button kind="ghost" small disabled={busy !== null} onClick={save}>{busy === "save" ? "Saving…" : "Save edits"}</Button>
          {ready && <Button small disabled={busy !== null} onClick={accept}>{busy === "accept" ? "Starting…" : "Accept plan and write the posts"}</Button>}
        </div>
        <ErrorNote error={error} />
      </Card>
      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold">Your facts</h2>
        {brief?.product && <p><span className="text-slate-600">Promoting: </span><b>{brief.product}</b></p>}
        {brief?.offer && <p><span className="text-slate-600">Deal: </span><b>{displayOffer(brief.offer)}</b></p>}
        {brief?.highlights && <p><span className="text-slate-600">What makes you special: </span><b>{brief.highlights}</b></p>}
        {(campaign.brain.files ?? []).length > 0 && (
          <div>
            <span className="text-slate-600">Attached: </span>
            {(campaign.brain.files ?? []).map((f) => (
              <a key={f.url} href={f.url} className="mr-2 underline" target="_blank" rel="noreferrer">{f.filename}</a>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-1 text-xs">
          {factRows(offer).map((row) => (
            <div key={row.label}><span className="text-slate-600">{row.label}: </span><b>{row.value}</b></div>))}
        </div>
        <h2 className="pt-2 font-semibold">Near {name} {loc.verified && <Badge tone="green">verified · {loc.data_source}</Badge>}</h2>
        <LocalityMap locality={loc} businessName={campaign.brain.business?.name} />
        <ul className="space-y-1 text-xs">
          {loc.signals.map((sg, i) => <li key={i}><b>{sg.count} {sg.type}</b> nearby{sg.examples.length ? ` (${sg.examples.slice(0, 2).join(", ")})` : ""}{sg.nearest_m ? `, nearest ${sg.nearest_m} m` : ""}</li>)}
        </ul>
        <ul className="space-y-1 text-xs text-slate-600">
          {loc.insights.map((ins, i) => <li key={i}>• {ins.interpretation}</li>)}
        </ul>
      </Card>
    </div>
  );
}

function CreativesTab({ assets, generating, awaitingPlan, product, languageLine, onOpen, onRegenerate }: {
  assets: Asset[];
  generating: boolean;
  awaitingPlan: boolean;
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
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
          These designs were composed by Looply from your verified copy, so you can see and download every creative right now.
          Photos and video stay as previews until an image service is connected.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((a) => <CreativeCard key={a.id} asset={a} onZoom={setZoom} onOpen={() => onOpen(a)} onRegenerate={() => onRegenerate(a)} />)}
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

function mediaNote(a: Asset): string {
  if (a.media_status === "pending" || a.media_status === "processing") return "The words are ready. The picture is still rendering.";
  if (a.content.media_error) return "The picture didn't come through. The copy below is still yours.";
  return "Text-only. The copy below is ready to review.";
}

function CreativeCard({
  asset: a,
  onZoom,
  onOpen,
  onRegenerate,
}: {
  asset: Asset;
  onZoom: (z: { src: string; title: string }) => void;
  onOpen: () => void;
  onRegenerate: () => void;
}) {
  const title = `${FORMAT_NAMES[a.format] ?? a.format} · ${a.platform}`;
  const slides = a.content.slide_urls ?? [];
  const [slide, setSlide] = useState(0);
  const src = slides.length > 1 ? slides[slide] : a.media_url;
  const tall = ["story", "reel"].includes(a.format);
  const source = a.content.media_source;
  return (
    <Card compact className="flex flex-col gap-2 text-sm">
      <div className="flex items-start gap-2">
        <div className="text-base font-semibold">{a.content.headline || (a.format === "message" ? String(a.content.body ?? "").split("\n")[0] : FORMAT_NAMES[a.format] ?? a.format)}</div>
        <span className="ml-auto"><Badge tone={statusTone(a.status)}>{statusLabel(a.status)}</Badge></span>
      </div>
      <div className="text-xs text-slate-600">{FORMAT_NAMES[a.format] ?? a.format} · {cap(a.platform)} · {LANGUAGES[a.language] ?? a.language}</div>
      {src ? (
        <button type="button" onClick={() => onZoom({ src, title })}
          className={`flex items-center justify-center overflow-hidden rounded-lg bg-slate-100 ${focusCls} ${tall ? "h-96" : "h-72"}`}>
          <img src={src} alt={title} className="h-full w-auto object-contain" />
        </button>
      ) : a.format === "message" ? (
        <div className="rounded-lg bg-slate-100 p-3">
          <div className="ml-auto max-w-[90%] whitespace-pre-wrap rounded-lg bg-emerald-50 p-2 text-xs text-slate-900 shadow">{String(a.content.body ?? "")}</div>
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-lg bg-slate-100 px-3 text-center text-xs text-slate-600">
          {mediaNote(a)}
        </div>
      )}
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
      <div className="text-xs">
        {a.format !== "message" && a.content.body && <div className="line-clamp-3 text-slate-600">{a.content.body}</div>}
        {a.content.cta && <div className="mt-1 text-brand-700">→ {a.content.cta}</div>}
      </div>
      {a.content.media_note && <p className="text-xs text-amber-800">{a.content.media_note}</p>}
      <FactNotes asset={a} />
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs">
        {src && <a href={src} download className={`rounded border border-slate-500 px-2 py-1 hover:bg-slate-50 ${focusCls}`}>Download</a>}
        {slides.length > 1 && <span className="text-slate-600">slide {slide + 1}/{slides.length}</span>}
        <Button kind="ghost" small onClick={onOpen}>Edit copy</Button>
        <Button kind="ghost" small onClick={onRegenerate}>🔄 Regenerate image</Button>
        {source && <span className="ml-auto text-slate-600">{source === "storyboard" ? "Animated storyboard" : source === "composed" ? "Composed design" : "AI generated"}</span>}
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
    document.getElementById(`asset-${focus.assetId}`)?.scrollIntoView({ block: "center" });
  }, [focus]);
  const shown = assets.filter((a) => a.platform === platform && a.language === language);
  const platforms = [...new Set(assets.map((a) => a.platform))];
  const languages = [...new Set(assets.map((a) => a.language))];
  if (!assets.length) return <p className="text-sm text-slate-600">Copy appears here once the plan is accepted.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        {platforms.map((p) => <button key={p} type="button" onClick={() => setPlatform(p)} className={`rounded-lg px-2.5 py-1 capitalize ${focusCls} ${p === platform ? selectedCls : idleCls}`}>{p}</button>)}
        <span className="mx-1 hidden border-l sm:inline" />
        {languages.map((l) => <button key={l} type="button" onClick={() => setLanguage(l)} className={`rounded-lg px-2.5 py-1 ${focusCls} ${l === language ? selectedCls : idleCls}`}>{LANGUAGES[l] ?? l}</button>)}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {shown.map((a) => <AssetCard key={a.id} asset={a} campaign={campaign} onChanged={onChanged} onRegenerate={() => onRegenerate(a)} />)}
      </div>
    </div>
  );
}

function AssetCard({
  asset,
  campaign,
  onChanged,
  onRegenerate,
}: {
  asset: Asset;
  campaign: CampaignT;
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
  return (
    <Card className={`space-y-2 text-sm ${asset.is_selected ? "ring-2 ring-brand-700" : ""}`}>
      <div id={`asset-${asset.id}`} className="flex flex-wrap items-center gap-2">
        <b className="capitalize">{asset.format}</b> <span className="text-xs text-slate-600">variant {asset.variant}</span>
        <Badge tone={statusTone(asset.status)}>{statusLabel(asset.status)}</Badge>
        {asset.is_selected && <Badge tone="blue">Selected</Badge>}
      </div>
      {asset.media_url && <img src={asset.media_url} alt="" className="max-h-56 rounded-lg" />}
      {(asset.content.slide_urls ?? []).length > 1 && (
        <div className="flex gap-1 overflow-auto">{asset.content.slide_urls!.map((u, i) => <img key={i} src={u} alt="" className="h-24 rounded" />)}</div>
      )}
      {asset.media_status === "failed" && <p className="text-xs text-red-700">The picture didn't come through. The copy below is still yours.</p>}
      <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-slate-900">
        Must match: {offerLine(campaign.brain.brief, campaign.brain.offer)} · {LANGUAGES[asset.language] ?? asset.language} · {cap(asset.platform)}
      </p>
      {editing ? (
        <textarea className={`${inputCls} text-xs`} rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
      ) : (
        <pre className="whitespace-pre-wrap font-sans text-xs">{assetText(asset)}</pre>
      )}
      <div className="flex flex-wrap gap-2">
        {!asset.is_selected && <Button small kind="ghost" disabled={busy !== null} onClick={() => act("select")}>{busy === "select" ? "Selecting…" : "Select this variant"}</Button>}
        <Button small kind="ghost" onClick={() => setEditing(!editing)}>{editing ? "Cancel" : "Edit"}</Button>
        {editing && <Button disabled={busy === "save"} onClick={async () => {
          setBusy("save");
          try { await api.patch(`/assets/${asset.id}`, { content: { ...asset.content, body } }); setEditing(false); onChanged(); }
          catch (e) { setError(e); } finally { setBusy(null); }
        }}>{busy === "save" ? "Saving…" : "Save and re-check"}</Button>}
        <Button small kind="ghost" onClick={onRegenerate}>🔄 Regenerate with corrections</Button>
        <Button small kind="danger" disabled={busy !== null} onClick={() => act("reject")}>{busy === "reject" ? "Rejecting…" : "Reject"}</Button>
      </div>
      <ErrorNote error={error} />
    </Card>
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
    <div className="grid gap-3">
      {localized.map((a) => (
        <Card key={a.id} className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <div className="mb-1 text-sm font-semibold">{FORMAT_NAMES[a.format] ?? a.format} in {LANGUAGES[a.language] ?? a.language} for {cap(a.platform)}</div>
            <div className="mb-1 text-xs text-slate-600">fit {a.content.localization?.score ?? "—"}</div>
            <pre className="whitespace-pre-wrap font-sans text-xs">{assetText(a)}</pre>
            {a.cultural_notes && <p className="mt-2 text-xs text-slate-600">Cultural notes: {a.cultural_notes}</p>}
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-slate-600">Back-translation to English</div>
            <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700">{a.content.localization?.back_translation || "—"}</pre>
          </div>
        </Card>
      ))}
    </div>
  );
}

function PerformanceTab({ campaign }: { campaign: CampaignT }) {
  const s = campaign.summary;
  const selected = (campaign.assets ?? []).filter((a) => a.is_selected && a.prediction?.predicted_score);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Score label="Predicted impact" value={s?.predicted_impact} />
        <Score label="Platform fit" value={s?.platform_fit} />
        <Score label="Local relevance" value={s?.local_relevance} />
        <Score label="Pieces ready" value={s?.verified ?? null} />
      </div>
      <p className="text-sm text-amber-800">These are estimates made before publishing, not measured results. Results show the numbers from the platforms after something is published.</p>
      <p className="text-sm text-slate-600">{offerLine(campaign.brain.brief, campaign.brain.offer)} · {productOf(campaign)}</p>
      <div className="grid gap-2">
        {selected.map((a) => (
          <Card key={a.id} className="flex items-center justify-between text-sm">
            <span className="capitalize">{a.platform} {a.format} · {LANGUAGES[a.language] ?? a.language} · variant {a.variant}</span>
            <span className="font-semibold">{a.prediction.predicted_score}</span>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Score({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <Card className="text-center">
      <div className="text-2xl font-bold text-brand-700">{value ?? "—"}</div>
      <div className="text-xs text-slate-600">{label}</div>
    </Card>
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
      onChanged();
      onApproved();
    } catch (e) { setError(e); } finally { setBusy(null); }
  }
  return (
    <div className="space-y-4">
      <Card id="approve-posts" className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Choose posts to approve</h2>
          {readyIds.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allOn} onChange={() => setPicked(allOn ? [] : readyIds)} />
              Check all
            </label>
          )}
        </div>
        <p className="text-slate-600">Check every post you want to publish, or use Check all, then approve.</p>
        {posts.length === 0 && <p className="text-slate-600">Posts show up here once the creatives are ready.</p>}
        <ul className="space-y-2">
          {posts.map((asset) => {
            const open = canTick(asset);
            const checked = asset.status === "approved" || picked.includes(asset.id);
            const thumb = asset.media_url || asset.content.slide_urls?.[0];
            return (
              <li key={asset.id}>
                <label className={`flex items-center gap-3 rounded-lg border border-slate-200 px-2 py-2 ${open ? "cursor-pointer hover:bg-slate-50" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!open}
                    onChange={() => setPicked((cur) => cur.includes(asset.id) ? cur.filter((id) => id !== asset.id) : [...cur, asset.id])}
                  />
                  {thumb && <img src={thumb} alt="" className="h-14 w-14 rounded object-cover" />}
                  <span className="min-w-0">
                    <span className="block font-medium">{postTitle(asset)}</span>
                    <span className="block text-xs text-slate-600">
                      {FORMAT_NAMES[asset.format] ?? asset.format} · {cap(asset.platform)} · {LANGUAGES[asset.language] ?? asset.language}
                      {asset.variant ? ` · ${asset.variant}` : ""}
                    </span>
                  </span>
                  <span className="ml-auto"><Badge tone={statusTone(asset.status)}>{statusLabel(asset.status)}</Badge></span>
                </label>
              </li>
            );
          })}
        </ul>
        {canApprove && readyIds.length > 0 && (
          <Button disabled={busy !== null || picked.length === 0} onClick={approve}>
            {busy === "approve" ? "Approving…" : `Approve ${picked.length} ${picked.length === 1 ? "post" : "posts"}`}
          </Button>
        )}
        <ErrorNote error={error} />
      </Card>
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold">Approve {productOf(campaign)} for {shopOf(campaign)}</h2>
        <p>{offerLine(campaign.brain.brief, campaign.brain.offer)}</p>
        <p className="text-slate-600">{langList(campaign.brain.strategy?.languages) || "No languages yet"} · {(campaign.brain.strategy?.platforms ?? []).map(cap).join(", ") || "No platforms yet"}</p>
        <p>Status: <Badge tone={statusTone(campaign.brain.approval.status)}>{statusLabel(campaign.brain.approval.status)}</Badge>
          {campaign.brain.approval.by && <span className="text-xs text-slate-600"> by {campaign.brain.approval.by}</span>}</p>
        <p className="text-xs text-slate-600">{campaign.summary?.verified ?? 0} verified, {campaign.summary?.failed ?? 0} failed, {campaign.summary?.stale ?? 0} out of date.</p>
      </Card>
      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold">Your facts</h2>
        {campaign.brain.brief?.product && <p><span className="text-slate-600">Promoting: </span><b>{campaign.brain.brief.product}</b></p>}
        {campaign.brain.brief?.highlights && <p><span className="text-slate-600">What makes you special: </span><b>{campaign.brain.brief.highlights}</b></p>}
        {(campaign.brain.files ?? []).length > 0 && (
          <p><span className="text-slate-600">Attached: </span>{(campaign.brain.files ?? []).map((f) => f.filename).join(", ")}</p>
        )}
        <div className="grid grid-cols-2 gap-1 text-xs">
          {factRows(campaign.brain.offer).map((row) => (
            <div key={row.label}><span className="text-slate-600">{row.label}: </span><b>{row.value}</b></div>))}
        </div>
        <h2 className="pt-2 font-semibold">Change a locked fact</h2>
        <p className="text-xs text-slate-600">This starts a new version and rewrites only the pieces that use this fact.</p>
        <Field label="Discount">
          <input className={inputCls} value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </Field>
        <Button kind="ghost" disabled={busy !== null} onClick={changeFacts}>{busy === "facts" ? "Applying…" : "Apply change"}</Button>
      </Card>
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
      qc.invalidateQueries({ queryKey: ["jobs", campaign.id] });
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3">
      <Card className="space-y-2 text-sm">
        {notice && <p className="text-sm text-emerald-800">{notice}</p>}
        {accounts.isLoading && <p className="text-slate-600">Loading accounts</p>}
        {accounts.isError && <ErrorNote error={new Error("Couldn't load this. Try again.")} />}
        {!accounts.isLoading && !accounts.isError && connected.length === 0 && (
          <p>Connect an account first, or <Link className="text-brand-700 underline" to="/accounts">add a simulated one</Link>. Simulated posts are labelled and never go live.</p>
        )}
        {connected.length > 0 && <div>{productOf(campaign)} will go to {connected.map((a) => `${a.display_name}${a.simulated ? " (simulated)" : ""}`).join(", ")}.</div>}
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-600">
            Schedule
            <input type="datetime-local" className={`${fieldCls} mt-1 block`} value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
          <Button onClick={publish} disabled={!approved || busy || connected.length === 0}>{busy ? "Publishing…" : `Publish ${when ? "at scheduled time" : "now"}`}</Button>
        </div>
        {!approved && (
          <p className="text-sm text-amber-800">
            Publishing stays off until you approve.{" "}
            <Button kind="ghost" small onClick={() => onGoto("approval")}>Go to Approve</Button>
          </p>
        )}
        <ErrorNote error={error} />
      </Card>
      {approved && source && (
        <Card className="space-y-3 text-sm">
          <h2 className="font-semibold">Use this post again</h2>
          <p className="text-slate-600">Send the same picture and words to YouTube, X, or another platform. Edit this post and post it again, or start a new version.</p>
          <label className="block text-xs text-slate-600">
            Post
            <select className={`${fieldCls} mt-1 block`} value={source.id} onChange={(e) => setSourceId(e.target.value)}>
              {posts.map((a) => (
                <option key={a.id} value={a.id}>
                  {(a.content.headline || FORMAT_NAMES[a.format] || a.format)} · {PLATFORM_LABELS[a.platform] ?? a.platform} · {LANGUAGES[a.language] ?? a.language}
                </option>
              ))}
            </select>
          </label>
          {source.media_url && <img src={source.media_url} alt="" className="h-28 rounded-lg object-cover" />}
          <label className="block text-xs text-slate-600">
            Also post on
            <select className={`${fieldCls} mt-1 block`} value={target} onChange={(e) => setTarget(e.target.value)}>
              {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={reuseBusy !== null} onClick={sendElsewhere}>{reuseBusy === "send" ? "Sending…" : "Post this picture there"}</Button>
            <Button kind="ghost" disabled={reuseBusy !== null} onClick={() => onEdit(source)}>Edit this post</Button>
            <Button kind="ghost" disabled={reuseBusy !== null} onClick={postAgain}>{reuseBusy === "again" ? "Posting…" : "Post again"}</Button>
            <Button kind="ghost" disabled={reuseBusy !== null} onClick={makeVersion}>{reuseBusy === "create" ? "Creating…" : "Create a new version"}</Button>
          </div>
          {reuseNote && <p className="text-sm text-emerald-800">{reuseNote}</p>}
          <ErrorNote error={reuseError} />
        </Card>
      )}
      {(jobs.data ?? []).map((j) => (
        <Card key={j.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div>
            <b className="capitalize">{j.platform}</b> {j.simulated && <Badge tone="amber">Simulated</Badge>}
            <div className="text-xs text-slate-600">{j.result?.url || j.external_post_id || ""}{jobNote(j, connected)}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={statusTone(j.status)}>{statusLabel(j.status)}</Badge>
            {j.status === "failed" && <Button small kind="ghost" onClick={async () => { await api.post(`/publish-jobs/${j.id}/retry`); qc.invalidateQueries({ queryKey: ["jobs", campaign.id] }); }}>Retry</Button>}
            {["queued", "scheduled"].includes(j.status) && <Button small kind="danger" onClick={async () => { await api.post(`/publish-jobs/${j.id}/cancel`); qc.invalidateQueries({ queryKey: ["jobs", campaign.id] }); }}>Cancel</Button>}
          </div>
        </Card>
      ))}
    </div>
  );
}

function AnalyticsTab({ campaign }: { campaign: CampaignT }) {
  const qc = useQueryClient();
  const data = useQuery({
    queryKey: ["analytics", campaign.id],
    queryFn: () => api.get<{ rows: import("../lib/types").AnalyticsRow[]; report: import("../lib/types").AnalyticsReport | null }>(`/campaigns/${campaign.id}/analytics`),
  });
  const report = data.data?.report;
  const published = ["publishing", "published"].includes(campaign.status);
  return (
    <div className="space-y-3">
      <Button kind="ghost" small onClick={async () => { await api.post(`/campaigns/${campaign.id}/analytics/refresh`); setTimeout(() => qc.invalidateQueries({ queryKey: ["analytics", campaign.id] }), 1500); }}>Refresh from platforms</Button>
      {data.isError && <ErrorNote error={new Error("Couldn't load this. Try again.")} />}
      {report && <Card className="space-y-1 text-sm"><b>What happened:</b> {report.summary}<div className="text-xs text-slate-600">{report.prediction_accuracy}</div></Card>}
      {(report?.learnings ?? []).map((l, i) => (
        <Card key={i} className="text-sm"><b>{l.insight}</b><div className="text-xs text-slate-600">Evidence: {l.evidence}</div><div className="text-xs">Next time: {l.recommendation}</div></Card>
      ))}
      <div className="grid gap-2">
        {(data.data?.rows ?? []).map((r) => (
          <Card key={r.asset_id + r.platform} className="flex flex-wrap justify-between gap-2 text-xs">
            <span className="capitalize">{r.platform} {r.format} · {LANGUAGES[r.language] ?? r.language} {r.simulated && <Badge tone="amber">Simulated</Badge>}</span>
            <span>{Object.entries(r.metrics).filter(([k, v]) => k !== "simulated" && typeof v === "number").map(([k, v]) => `${k} ${v}`).join(" · ")}</span>
          </Card>
        ))}
      </div>
      {data.data && !data.data.rows.length && (
        <p className="text-sm text-slate-600">
          {published
            ? "Published. Platform numbers usually take a little while. Refresh from platforms when you want to check."
            : "Results show up after something is published. Until then, Predictions is an estimate, not a result."}
        </p>
      )}
    </div>
  );
}
