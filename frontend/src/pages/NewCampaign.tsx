import { useQuery } from "@tanstack/react-query";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api } from "../lib/api";
import { Brief, Business, LANGUAGES, PLATFORMS } from "../lib/types";
import { Button, Card, ErrorNote, Field, inputCls } from "../lib/ui";

const FORMAT_CATALOG: Record<string, string[]> = {
  instagram: ["post", "story", "reel", "carousel", "poster"],
  whatsapp: ["message", "offer_card"],
  facebook: ["post"],
  linkedin: ["post"],
};
const FORMAT_LABELS: Record<string, string> = {
  post: "Feed post", story: "Story card", reel: "Reel / video", carousel: "Carousel", poster: "Poster",
  message: "Message", offer_card: "Offer card",
};
const PRESETS: { label: string; formats: Record<string, string[]> }[] = [
  { label: "Poster + story + reel", formats: { instagram: ["poster", "story", "reel"] } },
  { label: "Instagram + WhatsApp", formats: { instagram: ["post", "story"], whatsapp: ["message", "offer_card"] } },
  { label: "Everything visual", formats: { instagram: ["post", "story", "reel", "carousel", "poster"], whatsapp: ["offer_card"] } },
];
const AUDIENCES = ["College students", "Young professionals", "Families", "Office workers", "Couples", "Tourists", "Fitness lovers"];
const GOALS = ["Make people aware we exist", "More walk-in visits", "More orders / enquiries", "Fill the weekend",
  "Promote an offer", "Launch something new"];
const TONES = ["Fun & youthful", "Warm & friendly", "Premium & elegant", "Bold & energetic", "Calm & trustworthy"];
const STEPS = ["Business", "The essentials", "Extra details", "Formats & languages", "Review"];

export default function NewCampaign() {
  const nav = useNavigate();
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => api.get<Business[]>("/businesses") });
  const [step, setStep] = useState(0);
  const [businessId, setBusinessId] = useState("");
  const [brief, setBrief] = useState<Brief>({});
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"ai" | "user">("user");
  const [formats, setFormats] = useState<Record<string, string[]>>(PRESETS[0].formats);
  const [languages, setLanguages] = useState<string[]>(["en"]);
  const [skipReview, setSkipReview] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const biz = businesses.data?.find((b) => b.id === businessId);
  useEffect(() => {
    if (!businessId && businesses.data?.length === 1) setBusinessId(businesses.data[0].id);
  }, [businesses.data, businessId]);
  useEffect(() => {
    if (biz && !brief.region) setBrief((b) => ({ ...b, region: [biz.address, biz.city].filter(Boolean).join(", ") || undefined }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biz?.id]);

  const set = (k: keyof Brief) => (v: string) => setBrief((b) => ({ ...b, [k]: v || undefined }));
  const chosen = Object.fromEntries(Object.entries(formats).filter(([, v]) => v.length));
  const canNext = [!!businessId, true, true, mode === "ai" || Object.keys(chosen).length > 0, true][step];

  function toggleFormat(platform: string, fmt: string) {
    const cur = formats[platform] ?? [];
    setFormats({ ...formats, [platform]: cur.includes(fmt) ? cur.filter((f) => f !== fmt) : [...cur, fmt] });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ id: string }>("/campaigns", {
        business_id: businessId, message, brief, content_mode: mode,
        requested_formats: mode === "user" ? chosen : {}, requested_languages: languages,
        auto_accept_strategy: skipReview,
      });
      nav(`/campaigns/${res.id}`);
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">New campaign</h1>
      <Stepper step={step} onJump={(i) => i < step && setStep(i)} />

      {step === 0 && (
        <Card className="space-y-3">
          <StepTitle title="Which business is this for?" hint="We use its name, category and location to write the copy." />
          {businesses.isLoading ? <p className="text-sm text-slate-500">Loading…</p> : (businesses.data ?? []).length === 0 ? (
            <p className="text-sm text-amber-700">You need a business first. <Link className="underline" to="/businesses/new">Add one</Link>.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {(businesses.data ?? []).map((b) => (
                <button key={b.id} type="button" onClick={() => setBusinessId(b.id)}
                  className={`rounded-xl border p-3 text-left ${businessId === b.id ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-slate-200 hover:bg-slate-50"}`}>
                  <div className="font-semibold">{b.name}</div>
                  <div className="text-xs text-slate-500">{[b.category, b.city].filter(Boolean).join(" · ") || "No details yet"}</div>
                </button>
              ))}
            </div>
          )}
          <Link to="/businesses/new" className="text-xs text-brand-700 underline">+ Add another business</Link>
        </Card>
      )}

      {step === 1 && (
        <Card className="space-y-4">
          <StepTitle title="Tell us the basics" hint="Short answers are fine. Even one or two words are enough: we fill in the creative side." />
          <Field label="What are you promoting?">
            <input className={inputCls} value={brief.product ?? ""} onChange={(e) => set("product")(e.target.value)}
              placeholder={`e.g. our new continental menu, ${biz?.name ?? "the business"} itself, a cold coffee`} />
          </Field>
          <Field label="Who is it for?">
            <input className={inputCls} value={brief.audience ?? ""} onChange={(e) => set("audience")(e.target.value)}
              placeholder="e.g. college students, families nearby" />
          </Field>
          <Chips options={AUDIENCES} value={brief.audience} onPick={set("audience")} />
          <Field label="Where? (area, city)">
            <input className={inputCls} value={brief.region ?? ""} onChange={(e) => set("region")(e.target.value)}
              placeholder="e.g. Indiranagar, Bengaluru" />
          </Field>
          <Field label="What do you want to achieve?">
            <input className={inputCls} value={brief.goal ?? ""} onChange={(e) => set("goal")(e.target.value)}
              placeholder="e.g. make people aware we exist" />
          </Field>
          <Chips options={GOALS} value={brief.goal} onPick={set("goal")} />
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-4">
          <StepTitle title="Anything extra? (optional)"
            hint="Only facts you enter here will appear as offers, prices or dates. We never make them up." />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Offer or price">
              <input className={inputCls} value={brief.offer ?? ""} onChange={(e) => set("offer")(e.target.value)} placeholder="e.g. 20% off, ₹149" />
            </Field>
            <Field label="Occasion">
              <input className={inputCls} value={brief.occasion ?? ""} onChange={(e) => set("occasion")(e.target.value)} placeholder="e.g. grand opening, Diwali, this weekend" />
            </Field>
            <Field label="Date">
              <input type="date" className={inputCls} value={brief.event_date ?? ""} onChange={(e) => set("event_date")(e.target.value)} />
            </Field>
            <Field label="What makes you special?">
              <input className={inputCls} value={brief.highlights ?? ""} onChange={(e) => set("highlights")(e.target.value)} placeholder="e.g. wood-fired oven, rooftop seating" />
            </Field>
          </div>
          <div>
            <div className="mb-1 text-sm font-medium text-slate-700">Tone</div>
            <Chips options={TONES} value={brief.tone} onPick={set("tone")} />
          </div>
          <Field label="Anything else, in your own words (or speak it)">
            <textarea className={inputCls} rows={3} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="We just opened, we want more people to know about us…" />
          </Field>
          <VoiceButton onText={(t) => setMessage((m) => (m ? `${m} ${t}` : t))} onError={setError} />
        </Card>
      )}

      {step === 3 && (
        <Card className="space-y-4">
          <StepTitle title="What should we create?" hint="Each format gets a ready-to-view creative: posters, story cards, carousels and reel storyboards." />
          <div className="flex gap-2 text-sm">
            <Toggle on={mode === "user"} onClick={() => setMode("user")}>I'll choose</Toggle>
            <Toggle on={mode === "ai"} onClick={() => setMode("ai")}>Let the AI decide</Toggle>
          </div>
          {mode === "user" && (
            <>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button key={p.label} type="button" onClick={() => setFormats(p.formats)}
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50">{p.label}</button>
                ))}
              </div>
              <div className="grid gap-2">
                {PLATFORMS.map((p) => (
                  <div key={p} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-24 font-medium capitalize">{p}</span>
                    {FORMAT_CATALOG[p].map((f) => (
                      <Toggle key={f} small on={(formats[p] ?? []).includes(f)} onClick={() => toggleFormat(p, f)}>
                        {FORMAT_LABELS[f]}
                      </Toggle>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
          <div>
            <div className="mb-1 text-sm font-medium">Languages</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(LANGUAGES).map(([code, name]) => (
                <Toggle key={code} small on={languages.includes(code)}
                  onClick={() => setLanguages(languages.includes(code) ? languages.filter((l) => l !== code) : [...languages, code])}>
                  {name}
                </Toggle>
              ))}
            </div>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="space-y-3">
          <StepTitle title="Ready to generate" hint="Check the details, then we write, design, fact-check and score everything." />
          <dl className="grid grid-cols-[9rem_1fr] gap-y-1 text-sm">
            <Row k="Business" v={biz?.name} />
            <Row k="Promoting" v={brief.product} />
            <Row k="Audience" v={brief.audience} />
            <Row k="Region" v={brief.region} />
            <Row k="Goal" v={brief.goal} />
            <Row k="Offer" v={brief.offer} empty="None, so no deal or price will be mentioned" />
            <Row k="Occasion" v={[brief.occasion, brief.event_date].filter(Boolean).join(" · ")} empty="None" />
            <Row k="Tone" v={brief.tone} />
            <Row k="Notes" v={message} />
            <Row k="Formats" v={mode === "ai" ? "AI decides" : Object.entries(chosen).map(([p, f]) => `${p}: ${f.map((x) => FORMAT_LABELS[x]).join(", ")}`).join(" · ")} />
            <Row k="Languages" v={languages.map((l) => LANGUAGES[l]).join(", ")} />
          </dl>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={skipReview} onChange={(e) => setSkipReview(e.target.checked)} />
            Go straight to creatives (skip the strategy review step)
          </label>
          <ErrorNote error={error} />
        </Card>
      )}

      <div className="flex justify-between">
        <Button kind="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>← Back</Button>
        {step < STEPS.length - 1
          ? <Button disabled={!canNext} onClick={() => setStep(step + 1)}>Next →</Button>
          : <Button disabled={busy || !businessId} onClick={submit}>{busy ? "Starting…" : "✨ Generate creatives"}</Button>}
      </div>
    </div>
  );
}

function Stepper({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  return (
    <ol className="flex flex-wrap gap-2 text-xs">
      {STEPS.map((s, i) => (
        <li key={s}>
          <button type="button" onClick={() => onJump(i)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${i === step ? "bg-brand-600 text-white" : i < step ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-slate-500"}`}>
            <span className="font-semibold">{i < step ? "✓" : i + 1}</span>{s}
          </button>
        </li>
      ))}
    </ol>
  );
}

function StepTitle({ title, hint }: { title: string; hint: string }) {
  return <div><h2 className="text-lg font-semibold">{title}</h2><p className="text-sm text-slate-500">{hint}</p></div>;
}

function Chips({ options, value, onPick }: { options: string[]; value?: string; onPick: (v: string) => void }) {
  return (
    <div className="-mt-2 flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onPick(value === o ? "" : o)}
          className={`rounded-full px-2.5 py-0.5 text-xs ${value === o ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{o}</button>
      ))}
    </div>
  );
}

function Toggle({ on, onClick, children, small }: { on: boolean; onClick: () => void; children: ReactNode; small?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-lg ${small ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"} ${on ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
      {children}
    </button>
  );
}

function Row({ k, v, empty = "AI will fill this in" }: { k: string; v?: string | null; empty?: string }) {
  return <><dt className="text-slate-500">{k}</dt><dd>{v || <span className="text-slate-400">{empty}</span>}</dd></>;
}

function VoiceButton({ onText, onError }: { onText: (t: string) => void; onError: (e: unknown) => void }) {
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  async function record() {
    if (recording) { recorder.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const fd = new FormData();
        fd.append("file", new Blob(chunks, { type: rec.mimeType }), "voice.webm");
        try { onText((await api.post<{ text: string }>("/voice/transcribe", fd)).text); } catch (err) { onError(err); }
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch (err) { onError(err); }
  }
  return <Button kind="ghost" small onClick={record}>{recording ? "⏹ Stop & transcribe" : "🎤 Speak instead"}</Button>;
}
