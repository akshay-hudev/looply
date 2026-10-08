import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";

import LocalityMap from "../components/LocalityMap";
import { api } from "../lib/api";
import { useCampaignStream } from "../lib/stream";
import { Asset, Campaign as CampaignT, LANGUAGES, SocialAccount } from "../lib/types";
import { Badge, Button, Card, ErrorNote, Spinner, statusTone } from "../lib/ui";

const TABS = ["creatives", "strategy", "content", "localization", "truth", "performance", "approval", "publishing", "analytics"] as const;
const FORMAT_NAMES: Record<string, string> = {
  post: "Feed post", story: "Story card", reel: "Reel", carousel: "Carousel", poster: "Poster",
  message: "WhatsApp message", offer_card: "Offer card",
};

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
  const [picked, setTab] = useState<(typeof TABS)[number] | null>(null);

  if (!c) return <Spinner />;
  const assets = c.assets ?? [];
  const tab = picked ?? (assets.length ? "creatives" : "strategy");
  const status = live.status && c.status === "generating" ? live.status : c.status;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{c.title}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <Badge tone={statusTone(status)}>{status.replaceAll("_", " ")}</Badge>
            {c.stage && <span>stage: {c.stage}</span>}
            <span>version {c.current_version}</span>
          </div>
        </div>
      </div>

      {status === "generating" && (
        <Card>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Spinner /> Agents at work</div>
          <ul className="max-h-40 space-y-1 overflow-auto text-xs text-slate-600">
            {live.events.slice(-12).map((e) => (
              <li key={e.seq}><span className="font-medium text-slate-800">{e.agent}</span> — {e.message}</li>
            ))}
            {live.events.length === 0 && <li>Starting…</li>}
          </ul>
        </Card>
      )}

      {c.brain.clarifying_questions?.length > 0 && status === "clarifying" && <Clarify campaign={c} />}

      <div className="flex flex-wrap gap-1 border-b border-slate-200 text-sm">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-t-lg px-3 py-1.5 capitalize ${tab === t ? "bg-white font-semibold text-brand-700 border border-b-white border-slate-200" : "text-slate-500"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "creatives" && <CreativesTab assets={assets} generating={status === "generating"} onOpen={() => setTab("content")} />}
      {tab === "strategy" && <StrategyTab campaign={c} onChanged={() => qc.invalidateQueries({ queryKey: ["campaign", id] })} />}
      {tab === "content" && <ContentTab assets={assets} onChanged={() => qc.invalidateQueries({ queryKey: ["campaign", id] })} />}
      {tab === "localization" && <LocalizationTab assets={assets} />}
      {tab === "truth" && <TruthTab assets={assets} />}
      {tab === "performance" && <PerformanceTab campaign={c} />}
      {tab === "approval" && <ApprovalTab campaign={c} onChanged={() => qc.invalidateQueries({ queryKey: ["campaign", id] })} />}
      {tab === "publishing" && <PublishingTab campaign={c} />}
      {tab === "analytics" && <AnalyticsTab campaign={c} />}
    </div>
  );
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
      <div className="text-sm font-medium">The Campaign Manager needs a detail before continuing:</div>
      <ul className="list-disc pl-5 text-sm">{campaign.brain.clarifying_questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
      <div className="flex gap-2">
        <input className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" value={text}
          onChange={(e) => setText(e.target.value)} placeholder="Your answer"
          onKeyDown={(e) => { if (e.key === "Enter" && text && !send.isPending) send.mutate(); }} />
        <Button onClick={() => send.mutate()} disabled={!text || send.isPending}>{send.isPending ? "Sending…" : "Send"}</Button>
      </div>
      {send.isPending && <p className="text-xs text-slate-500">Answer received. Planning continues in a moment.</p>}
      <ErrorNote error={send.error} />
    </Card>
  );
}

function StrategyTab({ campaign, onChanged }: { campaign: CampaignT; onChanged: () => void }) {
  const s = campaign.brain.strategy;
  const loc = campaign.brain.locality;
  const offer = campaign.brain.offer;
  const [langs, setLangs] = useState(s.languages.join(", "));
  const [tone, setTone] = useState(s.tone);
  const [error, setError] = useState<unknown>(null);
  const ready = campaign.status === "strategy_review";

  async function save() {
    setError(null);
    try {
      await api.put(`/campaigns/${campaign.id}/strategy`, { languages: langs.split(",").map((l) => l.trim()).filter(Boolean), tone });
      onChanged();
    } catch (e) { setError(e); }
  }
  async function accept() {
    setError(null);
    try { await api.post(`/campaigns/${campaign.id}/strategy/accept`); onChanged(); } catch (e) { setError(e); }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold">Strategy</h2>
        <p><b>Objective:</b> {s.objective || "—"}</p>
        <p><b>Primary audience:</b> {s.primary_audience || "—"}</p>
        <p><b>Platforms:</b> {s.platforms.join(", ") || "—"}</p>
        <div>{Object.entries(s.formats).map(([p, fs]) => (
          <div key={p} className="text-xs text-slate-600">{p}: {fs.join(", ")}</div>))}</div>
        <p><b>Tone:</b> <input className="rounded border px-2 py-0.5" value={tone} onChange={(e) => setTone(e.target.value)} /></p>
        <p><b>Languages</b> (comma separated codes): <input className="rounded border px-2 py-0.5" value={langs} onChange={(e) => setLangs(e.target.value)} /></p>
        <p className="text-slate-600">{s.rationale}</p>
        <div className="text-xs text-slate-500">{s.posting_schedule.map((sl, i) => <div key={i}>{sl.platform}: {sl.day} {sl.time} — {sl.reason}</div>)}</div>
        <div className="flex gap-2 pt-1">
          <Button kind="ghost" small onClick={save}>Save edits</Button>
          {ready && <Button small onClick={accept}>Accept strategy & produce content</Button>}
        </div>
        <ErrorNote error={error} />
      </Card>
      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold">Locked offer facts</h2>
        <div className="grid grid-cols-2 gap-1 text-xs">
          {Object.entries(offer).filter(([, v]) => v && !(Array.isArray(v) && !v.length)).map(([k, v]) => (
            <div key={k}><span className="text-slate-500">{k}: </span><b>{String(v)}</b></div>))}
        </div>
        <h2 className="pt-2 font-semibold">Locality {loc.verified && <Badge tone="green">verified · {loc.data_source}</Badge>}</h2>
        <LocalityMap locality={loc} />
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

function CreativesTab({ assets, generating, onOpen }: { assets: Asset[]; generating: boolean; onOpen: () => void }) {
  const languages = [...new Set(assets.map((a) => a.language))];
  const [language, setLanguage] = useState(languages[0] ?? "en");
  const [all, setAll] = useState(false);
  const [zoom, setZoom] = useState<{ src: string; title: string } | null>(null);
  if (!assets.length) {
    return (
      <Card className="text-sm text-slate-500">
        {generating ? "Your creatives are being written, designed and fact-checked. They appear here as soon as they're ready."
          : "Creatives appear here once the strategy is accepted."}
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
          <button key={l} onClick={() => setLanguage(l)}
            className={`rounded px-2 py-1 ${l === language ? "bg-slate-800 text-white" : "bg-slate-100"}`}>{LANGUAGES[l] ?? l}</button>
        ))}
        <label className="ml-auto flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show all variants (A/B/C)
        </label>
      </div>
      {previewOnly && (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
          These designs were composed by LocalMind from your verified copy, so you can see and download every creative right now.
          Add an Agnes image or video key to get AI-generated photos and real video clips for publishing to Instagram, Facebook and LinkedIn.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((a) => <CreativeCard key={a.id} asset={a} onZoom={setZoom} onOpen={onOpen} />)}
      </div>
      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={() => setZoom(null)}>
          <div className="max-h-full max-w-3xl space-y-2 text-center" onClick={(e) => e.stopPropagation()}>
            <img src={zoom.src} alt={zoom.title} className="mx-auto max-h-[80vh] rounded-xl bg-white shadow-2xl" />
            <div className="flex justify-center gap-2">
              <a href={zoom.src} download className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium">⬇ Download</a>
              <a href={zoom.src} target="_blank" rel="noreferrer" className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium">Open in new tab</a>
              <button onClick={() => setZoom(null)} className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreativeCard({ asset: a, onZoom, onOpen }: { asset: Asset; onZoom: (z: { src: string; title: string }) => void; onOpen: () => void }) {
  const title = `${FORMAT_NAMES[a.format] ?? a.format} · ${a.platform}`;
  const slides = a.content.slide_urls ?? [];
  const [slide, setSlide] = useState(0);
  const src = slides.length > 1 ? slides[slide] : a.media_url;
  const tall = ["story", "reel"].includes(a.format);
  const source = a.content.media_source;
  return (
    <Card className="flex flex-col gap-2 p-3 text-sm">
      <div className="flex items-center gap-2">
        <b>{FORMAT_NAMES[a.format] ?? a.format}</b>
        <span className="text-xs capitalize text-slate-400">{a.platform} · {a.variant}</span>
        <span className="ml-auto"><Badge tone={statusTone(a.status)}>{a.status.replaceAll("_", " ")}</Badge></span>
      </div>
      {src ? (
        <button type="button" onClick={() => onZoom({ src, title })}
          className={`flex items-center justify-center overflow-hidden rounded-lg bg-slate-100 ${tall ? "h-96" : "h-72"}`}>
          <img src={src} alt={title} className="h-full w-auto object-contain" />
        </button>
      ) : a.format === "message" ? (
        <div className="rounded-lg bg-[#e5ddd5] p-3">
          <div className="ml-auto max-w-[90%] whitespace-pre-wrap rounded-lg bg-[#dcf8c6] p-2 text-xs shadow">{String(a.content.body ?? "")}</div>
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">
          {a.media_status === "pending" || a.media_status === "processing" ? "Rendering…" : a.content.media_error ? `Media failed: ${a.content.media_error}` : "Text-only asset"}
        </div>
      )}
      {slides.length > 1 && (
        <div className="flex gap-1 overflow-auto">
          {slides.map((u, i) => (
            <button key={i} onClick={() => setSlide(i)} className={`shrink-0 rounded ${i === slide ? "ring-2 ring-brand-500" : ""}`}>
              <img src={u} alt={`slide ${i + 1}`} className="h-14 rounded" />
            </button>
          ))}
        </div>
      )}
      {a.format === "reel" && (a.content.video_script?.scenes ?? []).length > 0 && (
        <ol className="space-y-0.5 text-xs text-slate-600">
          {a.content.video_script!.scenes!.map((s, i) => <li key={i}><b>{s.t}</b> {s.overlay_text} <span className="text-slate-400">— {s.visual}</span></li>)}
        </ol>
      )}
      <div className="text-xs">
        {a.content.headline && <div className="font-semibold">{a.content.headline}</div>}
        {a.format !== "message" && a.content.body && <div className="line-clamp-3 text-slate-600">{a.content.body}</div>}
        {a.content.cta && <div className="mt-1 text-brand-700">→ {a.content.cta}</div>}
      </div>
      {a.content.media_note && <p className="text-xs text-amber-700">{a.content.media_note}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs">
        {src && <a href={src} download className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-50">⬇ Download</a>}
        {slides.length > 1 && <span className="text-slate-400">slide {slide + 1}/{slides.length}</span>}
        <button onClick={onOpen} className="text-brand-700 underline">Edit copy</button>
        {source && <span className="ml-auto text-slate-400">{source === "storyboard" ? "Animated storyboard" : source === "composed" ? "Composed design" : "AI generated"}</span>}
      </div>
    </Card>
  );
}

function assetText(a: Asset): string {
  const c = a.content;
  return [c.headline, c.hook, c.body, c.cta, ...(c.slides ?? []), ...(c.hashtags ?? [])].filter(Boolean).join("\n\n");
}

function ContentTab({ assets, onChanged }: { assets: Asset[]; onChanged: () => void }) {
  const [platform, setPlatform] = useState(assets[0]?.platform ?? "");
  const [language, setLanguage] = useState(assets[0]?.language ?? "");
  const shown = assets.filter((a) => a.platform === platform && a.language === language);
  const platforms = [...new Set(assets.map((a) => a.platform))];
  const languages = [...new Set(assets.map((a) => a.language))];
  if (!assets.length) return <p className="text-sm text-slate-500">Content appears here once the strategy is accepted.</p>;
  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-sm">
        {platforms.map((p) => <button key={p} onClick={() => setPlatform(p)} className={`rounded px-2 py-1 capitalize ${p === platform ? "bg-brand-600 text-white" : "bg-slate-100"}`}>{p}</button>)}
        <span className="mx-1 border-l" />
        {languages.map((l) => <button key={l} onClick={() => setLanguage(l)} className={`rounded px-2 py-1 ${l === language ? "bg-slate-800 text-white" : "bg-slate-100"}`}>{LANGUAGES[l] ?? l}</button>)}
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
  async function act(path: string) {
    setError(null);
    try { await api.post(`/assets/${asset.id}/${path}`); onChanged(); } catch (e) { setError(e); }
  }
  return (
    <Card className={`space-y-2 text-sm ${asset.is_selected ? "ring-2 ring-brand-500" : ""}`}>
      <div className="flex items-center gap-2">
        <b className="capitalize">{asset.format}</b> <span className="text-xs text-slate-400">variant {asset.variant}</span>
        <Badge tone={statusTone(asset.status)}>{asset.status.replaceAll("_", " ")}</Badge>
        {asset.is_selected && <Badge tone="blue">selected</Badge>}
      </div>
      {asset.media_url && <img src={asset.media_url} alt="" className="max-h-56 rounded-lg" />}
      {(asset.content.slide_urls ?? []).length > 1 && (
        <div className="flex gap-1 overflow-auto">{asset.content.slide_urls!.map((u, i) => <img key={i} src={u} alt="" className="h-24 rounded" />)}</div>
      )}
      {asset.media_status === "failed" && <p className="text-xs text-red-600">Media failed: {asset.content.media_error}</p>}
      {editing ? (
        <textarea className="w-full rounded border p-2 text-xs" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
      ) : (
        <pre className="whitespace-pre-wrap font-sans text-xs">{assetText(asset)}</pre>
      )}
      <div className="flex flex-wrap gap-1">
        {!asset.is_selected && <Button small kind="ghost" onClick={() => act("select")}>Select this variant</Button>}
        <Button small kind="ghost" onClick={() => setEditing(!editing)}>{editing ? "Cancel" : "Edit"}</Button>
        {editing && <Button small onClick={async () => { await api.patch(`/assets/${asset.id}`, { content: { ...asset.content, body } }); setEditing(false); onChanged(); }}>Save & re-check</Button>}
        <Button small kind="ghost" onClick={() => act("regenerate")}>Regenerate</Button>
        <Button small kind="danger" onClick={() => act("reject")}>Reject</Button>
      </div>
      <ErrorNote error={error} />
    </Card>
  );
}

function LocalizationTab({ assets }: { assets: Asset[] }) {
  const localized = assets.filter((a) => a.language !== "en" && a.is_selected);
  if (!localized.length) return <p className="text-sm text-slate-500">No localized assets yet.</p>;
  return (
    <div className="grid gap-3">
      {localized.map((a) => (
        <Card key={a.id} className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs text-slate-500">{a.platform} · {a.format} · {LANGUAGES[a.language] ?? a.language} · localization score {a.content.localization?.score ?? "—"}</div>
            <pre className="whitespace-pre-wrap font-sans text-xs">{assetText(a)}</pre>
            {a.cultural_notes && <p className="mt-2 text-xs text-slate-500">Cultural notes: {a.cultural_notes}</p>}
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-slate-500">Back-translation to English</div>
            <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700">{a.content.localization?.back_translation || "—"}</pre>
          </div>
        </Card>
      ))}
    </div>
  );
}

function TruthTab({ assets }: { assets: Asset[] }) {
  const selected = assets.filter((a) => a.is_selected);
  return (
    <div className="grid gap-2">
      {selected.map((a) => (
        <Card key={a.id} className="flex items-start justify-between text-sm">
          <div>
            <b className="capitalize">{a.platform} {a.format}</b> · {LANGUAGES[a.language] ?? a.language}
            <div className="text-xs text-slate-500">score {a.verification.score ?? "—"} · attempts {a.attempts}</div>
            <ul className="mt-1 text-xs text-red-700">
              {(a.verification.issues ?? []).map((iss, i) => <li key={i}>{iss.severity}: {iss.detail}</li>)}
            </ul>
          </div>
          <Badge tone={statusTone(a.status)}>{a.verification.status ?? a.status}</Badge>
        </Card>
      ))}
      {!selected.length && <p className="text-sm text-slate-500">Nothing verified yet.</p>}
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
        <Score label="Truth score" value={s?.truth?.avg_score ?? null} />
      </div>
      <p className="text-xs text-amber-700">All scores above are {s?.prediction_label ?? "AI-predicted"} — estimates made before publishing, not measured results.</p>
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
      <div className="text-xs text-slate-500">{label}</div>
    </Card>
  );
}

function ApprovalTab({ campaign, onChanged }: { campaign: CampaignT; onChanged: () => void }) {
  const [discount, setDiscount] = useState(campaign.brain.offer.discount ?? "");
  const [error, setError] = useState<unknown>(null);
  const [msg, setMsg] = useState("");
  const canApprove = campaign.status === "review" || campaign.status === "approved";
  async function changeFacts() {
    setError(null);
    try { await api.patch(`/campaigns/${campaign.id}/facts`, { offer: { discount } }); onChanged(); }
    catch (e) { setError(e); }
  }
  async function approve() {
    setError(null);
    try { await api.post(`/campaigns/${campaign.id}/approve`); setMsg("Approved. Nothing publishes until you say so on the Publishing tab."); onChanged(); }
    catch (e) { setError(e); }
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold">Owner approval</h2>
        <p>Status: <Badge tone={statusTone(campaign.brain.approval.status)}>{campaign.brain.approval.status}</Badge>
          {campaign.brain.approval.by && <span className="text-xs text-slate-500"> by {campaign.brain.approval.by}</span>}</p>
        <p className="text-xs text-slate-500">{campaign.summary?.verified ?? 0} verified, {campaign.summary?.failed ?? 0} failed, {campaign.summary?.stale ?? 0} stale selected assets.</p>
        {canApprove && campaign.status !== "approved" && <Button onClick={approve}>Approve all verified assets</Button>}
        {msg && <p className="text-xs text-emerald-700">{msg}</p>}
        <ErrorNote error={error} />
      </Card>
      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold">Change a locked fact</h2>
        <p className="text-xs text-slate-500">Editing a fact creates a new campaign version and regenerates only the assets that depend on it.</p>
        <label className="block text-xs">Discount
          <input className="mt-1 w-full rounded border px-2 py-1" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </label>
        <Button kind="ghost" small onClick={changeFacts}>Apply change</Button>
      </Card>
    </div>
  );
}

function PublishingTab({ campaign }: { campaign: CampaignT }) {
  const qc = useQueryClient();
  const jobs = useQuery({ queryKey: ["jobs", campaign.id], queryFn: () => api.get<import("../lib/types").PublishJob[]>(`/campaigns/${campaign.id}/publish-jobs`), refetchInterval: 4000 });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => api.get<SocialAccount[]>("/social/accounts") });
  const [when, setWhen] = useState("");
  const [error, setError] = useState<unknown>(null);
  const approved = ["approved", "publishing", "published"].includes(campaign.status);
  async function publish() {
    setError(null);
    try {
      await api.post(`/campaigns/${campaign.id}/publish`, { scheduled_at: when ? new Date(when).toISOString() : null });
      qc.invalidateQueries({ queryKey: ["jobs", campaign.id] });
    } catch (e) { setError(e); }
  }
  return (
    <div className="space-y-3">
      <Card className="space-y-2 text-sm">
        <div>Connected accounts: {(accounts.data ?? []).map((a) => `${a.display_name}${a.simulated ? " (simulated)" : ""}`).join(", ") || "none"}</div>
        <div className="flex items-center gap-2">
          <input type="datetime-local" className="rounded border px-2 py-1 text-xs" value={when} onChange={(e) => setWhen(e.target.value)} />
          <Button onClick={publish} disabled={!approved}>Publish {when ? "at scheduled time" : "now"}</Button>
        </div>
        {!approved && <p className="text-xs text-amber-700">Approve the campaign first.</p>}
        <ErrorNote error={error} />
      </Card>
      {(jobs.data ?? []).map((j) => (
        <Card key={j.id} className="flex items-center justify-between text-sm">
          <div>
            <b className="capitalize">{j.platform}</b> {j.simulated && <Badge tone="amber">simulated</Badge>}
            <div className="text-xs text-slate-500">{j.result?.url || j.external_post_id || ""}{j.error ? ` — ${j.error}` : ""}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={statusTone(j.status)}>{j.status}</Badge>
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
  return (
    <div className="space-y-3">
      <Button kind="ghost" small onClick={async () => { await api.post(`/campaigns/${campaign.id}/analytics/refresh`); setTimeout(() => qc.invalidateQueries({ queryKey: ["analytics", campaign.id] }), 1500); }}>Refresh from platforms</Button>
      {report && <Card className="space-y-1 text-sm"><b>What happened:</b> {report.summary}<div className="text-xs text-slate-500">{report.prediction_accuracy}</div></Card>}
      {(report?.learnings ?? []).map((l, i) => (
        <Card key={i} className="text-sm"><b>{l.insight}</b><div className="text-xs text-slate-500">Evidence: {l.evidence}</div><div className="text-xs">Next time: {l.recommendation}</div></Card>
      ))}
      <div className="grid gap-2">
        {(data.data?.rows ?? []).map((r) => (
          <Card key={r.asset_id + r.platform} className="flex justify-between text-xs">
            <span className="capitalize">{r.platform} {r.format} · {LANGUAGES[r.language] ?? r.language} {r.simulated && <Badge tone="amber">simulated data</Badge>}</span>
            <span>{Object.entries(r.metrics).filter(([k, v]) => k !== "simulated" && typeof v === "number").map(([k, v]) => `${k} ${v}`).join(" · ")}</span>
          </Card>
        ))}
      </div>
      {!data.data?.rows.length && <p className="text-sm text-slate-500">Actual metrics appear here after publishing.</p>}
    </div>
  );
}
