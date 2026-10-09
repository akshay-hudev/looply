import { useQuery } from "@tanstack/react-query";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { api } from "../lib/api";
import { displayOffer } from "../lib/offer";
import { Brief, Business, LANGUAGES, PLATFORMS } from "../lib/types";
import { Button, Card, DocumentTitle, ErrorNote, Field, focusCls, idleCls, inputCls, selectedCls, Stepper } from "../lib/ui";

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
const STEPS = ["Your shop", "The promotion", "Who it's for", "Where it goes", "Check this"];

function offerLine(brief: Brief): string {
  const typed = brief.offer?.trim();
  if (typed) return displayOffer(typed);
  return "No price or deal. We won't invent one.";
}
function langList(codes: string[]) {
  return codes.map((c) => LANGUAGES[c] ?? c).join(", ");
}
function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type CampaignStart = {
  business_id: string | null; region: string | null; languages: string[]; note: string | null;
  product: string | null; offer: string | null; audience: string | null; goal: string | null;
  occasion: string | null; event_date: string | null; tone: string | null; highlights: string | null;
};

const FACT_KEYS = ["product", "offer", "audience", "goal", "occasion", "event_date", "tone", "highlights"] as const;

export default function NewCampaign() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const learningId = params.get("learning") ?? "";
  const fromId = params.get("from") ?? "";
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => api.get<Business[]>("/businesses") });
  const [step, setStep] = useState(0);
  const [businessId, setBusinessId] = useState("");
  const [brief, setBrief] = useState<Brief>({});
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"ai" | "user">("user");
  const [formats, setFormats] = useState<Record<string, string[]>>(PRESETS[0].formats);
  const [languages, setLanguages] = useState<string[]>(["en"]);
  const [skipReview, setSkipReview] = useState(false);
  const [allowBlank, setAllowBlank] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const applied = useRef("");

  const start = useQuery({
    queryKey: ["campaign-start", businessId, learningId, fromId],
    queryFn: () => {
      const q = new URLSearchParams();
      if (businessId) q.set("business_id", businessId);
      if (learningId) q.set("learning", learningId);
      if (fromId) q.set("from", fromId);
      const s = q.toString();
      return api.get<CampaignStart>(`/campaigns/start${s ? `?${s}` : ""}`);
    },
  });

  const biz = businesses.data?.find((b) => b.id === businessId);
  useEffect(() => {
    if (!businessId && businesses.data?.length === 1) setBusinessId(businesses.data[0].id);
  }, [businesses.data, businessId]);
  useEffect(() => {
    if (biz && !brief.region) setBrief((b) => ({ ...b, region: [biz.address, biz.city].filter(Boolean).join(", ") || undefined }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biz?.id]);
  useEffect(() => {
    const data = start.data;
    if (!data?.business_id) return;
    const key = `${data.business_id}|${businessId}|${learningId}|${fromId}|${data.region ?? ""}|${data.languages.join(",")}|${data.note ?? ""}|${data.offer ?? ""}`;
    if (applied.current === key) return;
    applied.current = key;
    if (!businessId) setBusinessId(data.business_id);
    setBrief((b) => {
      const next = { ...b };
      if (data.region) next.region = data.region;
      if (fromId) {
        for (const k of FACT_KEYS) {
          const value = data[k];
          if (value) next[k] = value;
        }
      }
      return next;
    });
    if (data.languages.length) setLanguages(data.languages);
    if (data.note) setMessage((m) => m || data.note || "");
  }, [start.data, businessId, learningId, fromId]);

  const set = (k: keyof Brief) => (v: string) => setBrief((b) => ({ ...b, [k]: v || undefined }));
  const chosen = Object.fromEntries(Object.entries(formats).filter(([, v]) => v.length));
  const formatsReady = mode === "ai" || Object.keys(chosen).length > 0;
  const named = !!brief.product?.trim();
  const canNext = [!!businessId, named || allowBlank, true, formatsReady && languages.length > 0, true][step];
  const product = brief.product?.trim();

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

  const nextLabel = [
    biz ? `Continue with ${biz.name}` : "Continue",
    "Save this promotion",
    "Choose where it goes",
    product ? `Review ${product}` : "Review this",
  ][step];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <DocumentTitle title={biz?.name ?? "New campaign"} />
      <div>
        <h1 className="text-2xl font-bold">{biz?.name ?? "New campaign"}</h1>
        {biz && <p className="text-sm text-slate-600">{[biz.category, biz.city].filter(Boolean).join(" · ")}</p>}
      </div>
      <Stepper steps={STEPS} step={step} onJump={(i) => i < step && setStep(i)} />

      <div className={step > 0 ? "grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]" : ""}>
        <div className="space-y-4">
          {step === 0 && (
            <Card className="space-y-3">
              <StepTitle title="Which shop is this for?" hint="The name, category, and city stay with you through every step." />
              {businesses.isLoading ? <p className="text-sm text-slate-600">Loading businesses</p>
                : businesses.isError ? <ErrorNote error={new Error("Couldn't load your businesses. Try again.")} />
                : (businesses.data ?? []).length === 0 ? (
                <p className="text-sm text-amber-800">A campaign needs a business, the place you're promoting. <Link className="underline" to="/businesses/new">Add a business</Link>.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {(businesses.data ?? []).map((b) => (
                    <button key={b.id} type="button" onClick={() => setBusinessId(b.id)}
                      className={`rounded-xl border p-3 text-left ${focusCls} ${businessId === b.id ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-slate-200 hover:bg-slate-50"}`}>
                      <div className="font-semibold">{b.name}</div>
                      <div className="text-xs text-slate-500">{[b.category, b.city].filter(Boolean).join(" · ") || "No details yet"}</div>
                    </button>
                  ))}
                </div>
              )}
              <Link to="/businesses/new"><Button kind="ghost" small>+ Add another business</Button></Link>
            </Card>
          )}

          {step === 1 && (
            <Card className="space-y-4">
              <StepTitle title={`What is ${biz?.name ?? "this shop"} promoting?`} hint="The offer, date, and what makes you special stay locked. We never invent a price." />
              <Field label="What are you promoting?">
                <input className={inputCls} value={brief.product ?? ""} onChange={(e) => set("product")(e.target.value)}
                  placeholder={`e.g. our new continental menu, ${biz?.name ?? "the business"} itself, a cold coffee`} />
              </Field>
              {!named && (
                <div className="space-y-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <p>Name what you're promoting, or the draft stays general. No offer or price will be invented.</p>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={allowBlank} onChange={(e) => setAllowBlank(e.target.checked)} />
                    Continue without naming it
                  </label>
                </div>
              )}
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
            </Card>
          )}

          {step === 2 && (
            <Card className="space-y-4">
              <StepTitle title={product ? `Who is ${product} for?` : "Who is this for?"} hint={`${biz?.name ?? "The shop"} already has a place. Say who should see it, and how it should sound.`} />
              <Field label="Who is it for?">
                <input className={inputCls} value={brief.audience ?? ""} onChange={(e) => set("audience")(e.target.value)}
                  placeholder="e.g. college students, families nearby" />
              </Field>
              <Chips options={AUDIENCES} value={brief.audience} onPick={set("audience")} />
              <Field label="What do you want to achieve?">
                <input className={inputCls} value={brief.goal ?? ""} onChange={(e) => set("goal")(e.target.value)}
                  placeholder="e.g. make people aware we exist" />
              </Field>
              <Chips options={GOALS} value={brief.goal} onPick={set("goal")} />
              <div>
                <div className="mb-1 text-sm font-medium text-slate-700">Tone</div>
                <Chips options={TONES} value={brief.tone} onPick={set("tone")} />
              </div>
              <Field label="Where? (area, city)">
                <input className={inputCls} value={brief.region ?? ""} onChange={(e) => set("region")(e.target.value)}
                  placeholder="e.g. Indiranagar, Bengaluru" />
              </Field>
              <details className="rounded-lg bg-slate-50 px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">Add a note in your own words</summary>
                <div className="mt-3 space-y-2">
                  <textarea className={inputCls} rows={3} value={message} onChange={(e) => setMessage(e.target.value)}
                    aria-label="Anything else, in your own words"
                    placeholder="We just opened, we want more people to know about us…" />
                  <VoiceButton onText={(t) => setMessage((m) => (m ? `${m} ${t}` : t))} />
                </div>
              </details>
            </Card>
          )}

          {step === 3 && (
            <Card className="space-y-4">
              <StepTitle title="What should we create?"
                hint={`${product || "This promotion"} for ${biz?.name ?? "your shop"}, in ${langList(languages) || "a language you choose"}.`} />
              <div className="flex gap-2 text-sm">
                <Toggle on={mode === "user"} onClick={() => setMode("user")}>I'll choose</Toggle>
                <Toggle on={mode === "ai"} onClick={() => setMode("ai")}>Let the AI decide</Toggle>
              </div>
              {mode === "user" && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                      <button key={p.label} type="button" onClick={() => setFormats(p.formats)}
                        className={`rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50 ${focusCls}`}>{p.label}</button>
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
                {languages.length === 0 && <p className="mb-1 text-xs text-amber-800">Choose at least one language.</p>}
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
              <StepTitle title="Check this" hint="These are the facts the posts have to match." />
              <div>
                <p className="text-lg font-semibold">{product || "This promotion"} for {biz?.name}</p>
                <p className="text-sm text-slate-600">{offerLine(brief)} · {brief.audience || "customers nearby"} · {langList(languages)}</p>
              </div>
              <dl className="grid grid-cols-1 gap-y-1 text-sm sm:grid-cols-[9rem_1fr]">
                <Row k="Occasion" v={[brief.occasion, brief.event_date].filter(Boolean).join(" · ")} />
                <Row k="What makes you special" v={brief.highlights} />
                <Row k="Goal" v={brief.goal} />
                <Row k="Tone" v={brief.tone} />
                <Row k="Where" v={brief.region} />
                <Row k="Notes" v={message} />
                <Row k="Formats" v={mode === "ai" ? "AI decides" : Object.entries(chosen).map(([p, f]) => `${cap(p)}: ${f.map((x) => FORMAT_LABELS[x]).join(", ")}`).join(" · ")} />
              </dl>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={skipReview} onChange={(e) => setSkipReview(e.target.checked)} />
                Go straight to creatives (skip the plan review)
              </label>
              <ErrorNote error={error} />
            </Card>
          )}

          <div className="flex justify-between">
            <Button kind="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
            {step < STEPS.length - 1
              ? <Button disabled={!canNext} onClick={() => setStep(step + 1)}>{nextLabel}</Button>
              : <Button disabled={busy || !businessId || (!named && !allowBlank)} onClick={submit}>{busy ? "Starting…" : `Generate for ${biz?.name ?? "this shop"}`}</Button>}
          </div>
        </div>

        {step > 0 && (
          <Card className="space-y-2 lg:sticky lg:top-4">
            <h2 className="text-sm font-semibold">So far</h2>
            <Fact k="Shop" v={biz?.name ?? "Not chosen yet"} />
            <Fact k="Promoting" v={product || "Not named yet"} />
            <Fact k="Deal" v={offerLine(brief)} />
            <Fact k="For" v={brief.audience || "Not chosen yet"} />
            <Fact k="Where" v={brief.region || "Not set yet"} />
            <Fact k="In" v={langList(languages) || "No language yet"} />
            <Fact k="On" v={mode === "ai" ? "AI will choose" : Object.keys(chosen).map(cap).join(", ") || "Not chosen yet"} />
          </Card>
        )}
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-slate-600">{k}</div>
      <div className="text-sm text-slate-900">{v}</div>
    </div>
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
          className={`rounded-full px-2.5 py-1 text-xs ${focusCls} ${value === o ? selectedCls : idleCls}`}>{o}</button>
      ))}
    </div>
  );
}

function Toggle({ on, onClick, children, small }: { on: boolean; onClick: () => void; children: ReactNode; small?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-lg ${focusCls} ${small ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"} ${on ? selectedCls : idleCls}`}>
      {children}
    </button>
  );
}

function Row({ k, v }: { k: string; v?: string | null }) {
  if (!v) return null;
  return <><dt className="text-slate-600">{k}</dt><dd>{v}</dd></>;
}

function VoiceButton({ onText }: { onText: (t: string) => void }) {
  const [phase, setPhase] = useState<"idle" | "listening" | "writing">("idle");
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  async function record() {
    if (phase === "listening") { recorder.current?.stop(); return; }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setPhase("writing");
        const fd = new FormData();
        fd.append("file", new Blob(chunks, { type: rec.mimeType }), "voice.webm");
        try {
          onText((await api.post<{ text: string }>("/voice/transcribe", fd)).text);
          setPhase("idle");
        } catch {
          setPhase("idle");
          setError("Didn't catch that. Type it instead, or try again.");
        }
      };
      recorder.current = rec;
      rec.start();
      setPhase("listening");
    } catch {
      setPhase("idle");
      setError("Didn't catch that. Type it instead, or try again.");
    }
  }
  const status = phase === "listening"
    ? "Listening. Say it the way you'd tell a customer."
    : phase === "writing" ? "Writing that down…" : error;
  return (
    <div className="space-y-1">
      <Button kind="ghost" small pressed={phase === "listening"} onClick={record}>
        {phase === "listening" ? "Stop" : "Speak instead"}
      </Button>
      {status && <p role="status" className={`text-xs ${error && phase === "idle" ? "text-red-700" : "text-slate-600"}`}>{status}</p>}
    </div>
  );
}
