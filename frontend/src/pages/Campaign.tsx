import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import LocalityMap from "../components/LocalityMap";
import { api } from "../lib/api";
import { useCampaignStream } from "../lib/stream";
import { Asset, Campaign as CampaignT, LANGUAGES, SocialAccount } from "../lib/types";
import { Badge, Button, Card, DocumentTitle, ErrorNote, Field, fieldCls, focusCls, idleCls, inputCls, selectedCls, Spinner, statusLabel, statusTone } from "../lib/ui";

const TABS = ["creatives", "strategy", "content", "localization", "truth", "performance", "approval", "publishing", "analytics"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  creatives: "Creatives", strategy: "Plan", content: "Copy", localization: "Languages",
  truth: "Fact check", performance: "Predictions", approval: "Approve", publishing: "Publish", analytics: "Results",
};
const FORMAT_NAMES: Record<string, string> = {
  post: "Feed post", story: "Story card", reel: "Reel", carousel: "Carousel", poster: "Poster",
  message: "WhatsApp message", offer_card: "Offer card",
};
const STAGE_COPY: Record<string, string> = {
  intake: "Starting. You can leave this page; the campaign keeps going.",
  business: "Learning how this business should sound.",
  locality: "Looking up nearby places the copy can mention.",
  audience: "Choosing who this is for.",
  strategy: "Planning the campaign.",
  content: "Writing the posts.",
  localization: "Translating into the languages you chose.",
  verification: "Checking every number against your offer.",
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
  const c = q.data;
  const live = useCampaignStream(id, c?.status === "generating");
  const [picked, setTab] = useState<Tab | null>(null);
  const [contentFocus, setContentFocus] = useState<Focus | null>(null);
  const [notice, setNotice] = useState("");

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
  const tab = picked ?? (assets.length ? "creatives" : "strategy");
  const status = live.status && c.status === "generating" ? live.status : c.status;
  const broken = assets.find((a) => a.is_selected && (a.status === "failed" || a.verification?.status === "failed"));
  const step = nextStep(status, (c.summary?.failed ?? 0) > 0);
  const stageLine = STAGE_COPY[c.stage ?? ""] ?? "Writing the posts.";

  function openCopy(asset: Asset) {
    setContentFocus({ platform: asset.platform, language: asset.language, assetId: asset.id });
    setTab("content");
  }

  return (
    <div className="space-y-4">
      <DocumentTitle title={c.title} />
      <div>
        <h1 className="text-2xl font-bold">{c.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
          <span>Version {c.current_version}</span>
        </div>
      </div>

      {status === "generating" && (
        <Card>
          <p role="status" className="mb-1 flex items-center gap-2 text-sm font-medium"><Spinner /> {stageLine}</p>
          {c.stage !== "intake" && <p className="mb-2 text-xs text-slate-600">You can leave this page. The campaign keeps going.</p>}
          <ul className="max-h-40 space-y-1 overflow-auto text-xs text-slate-600">
            {live.events.slice(-12).map((e) => (
              <li key={e.seq}><span className="font-medium text-slate-800">{e.agent}</span> — {e.message}</li>
            ))}
            {live.events.length === 0 && <li>Starting. You can leave this page; the campaign keeps going.</li>}
          </ul>
        </Card>
      )}

      {c.brain.clarifying_questions?.length > 0 && status === "clarifying" && <Clarify campaign={c} />}

      {step && status !== "generating" && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">{step.title}</p>
            <p className="text-sm text-slate-600">{step.detail}</p>
          </div>
          <Button onClick={() => {
            if (step.tab === "content" && broken) openCopy(broken);
            else setTab(step.tab);
          }}>{step.action}</Button>
        </Card>
      )}

      <div role="tablist" aria-label="Campaign sections" className="flex flex-wrap gap-1 border-b border-slate-200 text-sm">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`-mb-px rounded-t-lg px-3 py-2 ${focusCls} ${tab === t ? "border border-b-white border-slate-200 bg-white font-semibold text-brand-700" : "text-slate-600 hover:text-slate-800"}`}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "creatives" && <CreativesTab assets={assets} generating={status === "generating"} awaitingPlan={status === "strategy_review"} onOpen={openCopy} />}
      {tab === "strategy" && <StrategyTab campaign={c} onChanged={() => qc.invalidateQueries({ queryKey: ["campaign", id] })} />}
      {tab === "content" && <ContentTab assets={assets} focus={contentFocus} onChanged={() => qc.invalidateQueries({ queryKey: ["campaign", id] })} />}
      {tab === "localization" && <LocalizationTab assets={assets} />}
      {tab === "truth" && <TruthTab assets={assets} onOpen={openCopy} />}
      {tab === "performance" && <PerformanceTab campaign={c} />}
      {tab === "approval" && (
        <ApprovalTab campaign={c} onChanged={() => qc.invalidateQueries({ queryKey: ["campaign", id] })}
          onApproved={() => { setNotice("Approved. Nothing publishes until you say so."); setTab("publishing"); }} />
      )}
      {tab === "publishing" && <PublishingTab campaign={c} notice={notice} onGoto={setTab} />}
      {tab === "analytics" && <AnalyticsTab campaign={c} />}
    </div>
  );
}

function nextStep(status: string, hasFailures: boolean): { title: string; detail: string; tab: Tab; action: string } | null {
  if (status === "strategy_review") {
    return { title: "Review the plan", detail: "Accept it when the platforms, languages, and tone look right.", tab: "strategy", action: "Open plan" };
  }
  if (hasFailures && (status === "review" || status === "approved")) {
    return { title: "A fact check failed", detail: "Approval stays off until every selected piece is verified.", tab: "content", action: "Open the copy" };
  }
  if (status === "review") {
    return { title: "Ready for your approval", detail: "Nothing publishes until you approve.", tab: "approval", action: "Review and approve" };
  }
  if (status === "approved") {
    return { title: "Ready to publish", detail: "Choose when it goes out. You can still hold it.", tab: "publishing", action: "Go to publish" };
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
  return (
    <Card className="space-y-2 border-amber-300">
      <div className="text-sm font-medium">One detail is missing before planning can continue.</div>
      <ul className="list-disc pl-5 text-sm">{campaign.brain.clarifying_questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
      <div className="flex flex-wrap gap-2">
        <input className={`${inputCls} min-w-0 flex-1`} value={text}
          onChange={(e) => setText(e.target.value)} placeholder="Your answer"
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
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<"save" | "accept" | null>(null);
  const ready = campaign.status === "strategy_review";

  function toggleLang(code: string) {
    setLangs(langs.includes(code) ? langs.filter((l) => l !== code) : [...langs, code]);
  }
  async function save() {
    setError(null);
    setBusy("save");
    try {
      await api.put(`/campaigns/${campaign.id}/strategy`, { languages: langs, tone });
      onChanged();
    } catch (e) { setError(e); } finally { setBusy(null); }
  }
  async function accept() {
    setError(null);
    setBusy("accept");
    try { await api.post(`/campaigns/${campaign.id}/strategy/accept`); onChanged(); } catch (e) { setError(e); } finally { setBusy(null); }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold">Plan</h2>
        <p><b>Objective:</b> {s.objective || "—"}</p>
        <p><b>Primary audience:</b> {s.primary_audience || "—"}</p>
        <p><b>Platforms:</b> {s.platforms.join(", ") || "—"}</p>
        <div>{Object.entries(s.formats).map(([p, fs]) => (
          <div key={p} className="text-xs text-slate-600">{p}: {fs.join(", ")}</div>))}</div>
        <Field label="Tone"><input className={inputCls} value={tone} onChange={(e) => setTone(e.target.value)} /></Field>
        <div>
          <div className="mb-1 text-sm font-medium text-slate-700">Languages</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(LANGUAGES).map(([code, name]) => (
              <button key={code} type="button" onClick={() => toggleLang(code)}
                className={`rounded-lg px-2.5 py-1 text-xs ${focusCls} ${langs.includes(code) ? selectedCls : idleCls}`}>{name}</button>
            ))}
          </div>
        </div>
        <p className="text-slate-600">{s.rationale}</p>
        <div className="text-xs text-slate-600">{s.posting_schedule.map((sl, i) => <div key={i}>{sl.platform}: {sl.day} {sl.time} — {sl.reason}</div>)}</div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button kind="ghost" small disabled={busy !== null} onClick={save}>{busy === "save" ? "Saving…" : "Save edits"}</Button>
          {ready && <Button small disabled={busy !== null} onClick={accept}>{busy === "accept" ? "Starting…" : "Accept plan and write the posts"}</Button>}
        </div>
        <ErrorNote error={error} />
      </Card>
      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold">Facts you locked in</h2>
        <div className="grid grid-cols-2 gap-1 text-xs">
          {Object.entries(offer).filter(([, v]) => v && !(Array.isArray(v) && !v.length)).map(([k, v]) => (
            <div key={k}><span className="text-slate-600">{k}: </span><b>{String(v)}</b></div>))}
        </div>
        <h2 className="pt-2 font-semibold">Nearby places {loc.verified && <Badge tone="green">verified · {loc.data_source}</Badge>}</h2>
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

function CreativesTab({ assets, generating, awaitingPlan, onOpen }: { assets: Asset[]; generating: boolean; awaitingPlan: boolean; onOpen: (asset: Asset) => void }) {
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
            ? "Accept the plan first. The creatives show up here after that."
            : "Creatives show up here after the plan is accepted."}
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
          These designs were composed by LocalMind from your verified copy, so you can see and download every creative right now.
          Photos and video stay as previews until an image service is connected.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((a) => <CreativeCard key={a.id} asset={a} onZoom={setZoom} onOpen={() => onOpen(a)} />)}
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

function mediaNote(a: Asset): string {
  if (a.media_status === "pending" || a.media_status === "processing") return "The words are ready. The picture is still rendering.";
  if (a.content.media_error) return "The picture didn't come through. The copy below is still yours.";
  return "Text-only. The copy below is ready to review.";
}

function CreativeCard({ asset: a, onZoom, onOpen }: { asset: Asset; onZoom: (z: { src: string; title: string }) => void; onOpen: () => void }) {
  const title = `${FORMAT_NAMES[a.format] ?? a.format} · ${a.platform}`;
  const slides = a.content.slide_urls ?? [];
  const [slide, setSlide] = useState(0);
  const src = slides.length > 1 ? slides[slide] : a.media_url;
  const tall = ["story", "reel"].includes(a.format);
  const source = a.content.media_source;
  return (
    <Card compact className="flex flex-col gap-2 text-sm">
      <div className="flex items-center gap-2">
        <b>{FORMAT_NAMES[a.format] ?? a.format}</b>
        <span className="text-xs capitalize text-slate-600">{a.platform} · {a.variant}</span>
        <span className="ml-auto"><Badge tone={statusTone(a.status)}>{statusLabel(a.status)}</Badge></span>
      </div>
      {src ? (
        <button type="button" onClick={() => onZoom({ src, title })}
          className={`flex items-center justify-center overflow-hidden rounded-lg bg-slate-100 ${focusCls} ${tall ? "h-96" : "h-72"}`}>
          <img src={src} alt={title} className="h-full w-auto object-contain" />
        </button>
      ) : a.format === "message" ? (
        <div className="rounded-lg bg-[#e5ddd5] p-3">
          <div className="ml-auto max-w-[90%] whitespace-pre-wrap rounded-lg bg-[#dcf8c6] p-2 text-xs shadow">{String(a.content.body ?? "")}</div>
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
        {a.content.headline && <div className="font-semibold">{a.content.headline}</div>}
        {a.format !== "message" && a.content.body && <div className="line-clamp-3 text-slate-600">{a.content.body}</div>}
        {a.content.cta && <div className="mt-1 text-brand-700">→ {a.content.cta}</div>}
      </div>
      {a.content.media_note && <p className="text-xs text-amber-800">{a.content.media_note}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs">
        {src && <a href={src} download className={`rounded border border-slate-500 px-2 py-1 hover:bg-slate-50 ${focusCls}`}>Download</a>}
        {slides.length > 1 && <span className="text-slate-600">slide {slide + 1}/{slides.length}</span>}
        <button type="button" onClick={onOpen} className={`text-brand-700 underline ${focusCls}`}>Edit copy</button>
        {source && <span className="ml-auto text-slate-600">{source === "storyboard" ? "Animated storyboard" : source === "composed" ? "Composed design" : "AI generated"}</span>}
      </div>
    </Card>
  );
}

function assetText(a: Asset): string {
  const c = a.content;
  return [c.headline, c.hook, c.body, c.cta, ...(c.slides ?? []), ...(c.hashtags ?? [])].filter(Boolean).join("\n\n");
}

function ContentTab({ assets, focus, onChanged }: { assets: Asset[]; focus: Focus | null; onChanged: () => void }) {
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
        {shown.map((a) => <AssetCard key={a.id} asset={a} onChanged={onChanged} />)}
      </div>
    </div>
  );
}

function AssetCard({ asset, onChanged }: { asset: Asset; onChanged: () => void }) {
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
        <Button small kind="ghost" disabled={busy !== null} onClick={() => act("regenerate")}>{busy === "regenerate" ? "Regenerating…" : "Regenerate"}</Button>
        <Button small kind="danger" disabled={busy !== null} onClick={() => act("reject")}>{busy === "reject" ? "Rejecting…" : "Reject"}</Button>
      </div>
      <ErrorNote error={error} />
    </Card>
  );
}

function LocalizationTab({ assets }: { assets: Asset[] }) {
  const localized = assets.filter((a) => a.language !== "en" && a.is_selected);
  const onlyEnglish = assets.length > 0 && assets.every((a) => a.language === "en");
  if (!localized.length) {
    return (
      <p className="text-sm text-slate-600">
        {onlyEnglish
          ? "No translation yet. Add a language besides English on the plan, or this campaign stays in English."
          : "No translation yet. Add a language besides English, or wait until the creatives finish."}
      </p>
    );
  }
  return (
    <div className="grid gap-3">
      {localized.map((a) => (
        <Card key={a.id} className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs text-slate-600">{a.platform} · {a.format} · {LANGUAGES[a.language] ?? a.language} · fit {a.content.localization?.score ?? "—"}</div>
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

function TruthTab({ assets, onOpen }: { assets: Asset[]; onOpen: (asset: Asset) => void }) {
  const selected = assets.filter((a) => a.is_selected);
  if (!selected.length) {
    return <p className="text-sm text-slate-600">Fact-check runs after the creatives exist. Approval stays off until every selected piece is verified.</p>;
  }
  return (
    <div className="grid gap-2">
      {selected.map((a) => (
        <Card key={a.id} className="flex flex-wrap items-start justify-between gap-2 text-sm">
          <div>
            <b className="capitalize">{a.platform} {a.format}</b> · {LANGUAGES[a.language] ?? a.language}
            <div className="text-xs text-slate-600">score {a.verification.score ?? "—"} · attempts {a.attempts}</div>
            <ul className="mt-1 text-xs text-red-700">
              {(a.verification.issues ?? []).map((iss, i) => <li key={i}>{iss.severity}: {iss.detail}</li>)}
            </ul>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={statusTone(a.verification.status ?? a.status)}>{statusLabel(a.verification.status ?? a.status)}</Badge>
            {(a.status === "failed" || a.verification.status === "failed") && (
              <Button small kind="ghost" onClick={() => onOpen(a)}>Edit copy</Button>
            )}
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
        <Score label="Fact-check score" value={s?.truth?.avg_score ?? null} />
      </div>
      <p className="text-sm text-amber-800">These are estimates made before publishing, not measured results. Results show the numbers from the platforms after something is published.</p>
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

function ApprovalTab({ campaign, onChanged, onApproved }: { campaign: CampaignT; onChanged: () => void; onApproved: () => void }) {
  const [discount, setDiscount] = useState(campaign.brain.offer.discount ?? "");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<"approve" | "facts" | null>(null);
  const canApprove = campaign.status === "review" || campaign.status === "approved";
  async function changeFacts() {
    setError(null);
    setBusy("facts");
    try { await api.patch(`/campaigns/${campaign.id}/facts`, { offer: { discount } }); onChanged(); }
    catch (e) { setError(e); } finally { setBusy(null); }
  }
  async function approve() {
    setError(null);
    setBusy("approve");
    try { await api.post(`/campaigns/${campaign.id}/approve`); onChanged(); onApproved(); }
    catch (e) { setError(e); } finally { setBusy(null); }
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold">Owner approval</h2>
        <p>Status: <Badge tone={statusTone(campaign.brain.approval.status)}>{statusLabel(campaign.brain.approval.status)}</Badge>
          {campaign.brain.approval.by && <span className="text-xs text-slate-600"> by {campaign.brain.approval.by}</span>}</p>
        <p className="text-xs text-slate-600">{campaign.summary?.verified ?? 0} verified, {campaign.summary?.failed ?? 0} failed, {campaign.summary?.stale ?? 0} out of date.</p>
        {canApprove && campaign.status !== "approved" && <Button disabled={busy !== null} onClick={approve}>{busy === "approve" ? "Approving…" : "Approve all verified assets"}</Button>}
        <ErrorNote error={error} />
      </Card>
      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold">Change a locked fact</h2>
        <p className="text-xs text-slate-600">This starts a new version and rewrites only the pieces that use this fact.</p>
        <Field label="Discount">
          <input className={inputCls} value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </Field>
        <Button kind="ghost" disabled={busy !== null} onClick={changeFacts}>{busy === "facts" ? "Applying…" : "Apply change"}</Button>
      </Card>
    </div>
  );
}

function PublishingTab({ campaign, notice, onGoto }: { campaign: CampaignT; notice: string; onGoto: (tab: Tab) => void }) {
  const qc = useQueryClient();
  const jobs = useQuery({ queryKey: ["jobs", campaign.id], queryFn: () => api.get<import("../lib/types").PublishJob[]>(`/campaigns/${campaign.id}/publish-jobs`), refetchInterval: 4000 });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => api.get<SocialAccount[]>("/social/accounts") });
  const [when, setWhen] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const approved = ["approved", "publishing", "published"].includes(campaign.status);
  const connected = accounts.data ?? [];
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
        {connected.length > 0 && <div>Connected accounts: {connected.map((a) => `${a.display_name}${a.simulated ? " (simulated)" : ""}`).join(", ")}</div>}
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
            <button type="button" className={`text-brand-700 underline ${focusCls}`} onClick={() => onGoto("approval")}>Go to Approve</button>
          </p>
        )}
        <ErrorNote error={error} />
      </Card>
      {(jobs.data ?? []).map((j) => (
        <Card key={j.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div>
            <b className="capitalize">{j.platform}</b> {j.simulated && <Badge tone="amber">Simulated</Badge>}
            <div className="text-xs text-slate-600">{j.result?.url || j.external_post_id || ""}{j.error ? ` — ${j.error}` : ""}</div>
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
