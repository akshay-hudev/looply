import { useRef, useState } from "react";

import { api } from "../lib/api";
import { VoiceOrb } from "../components/VoiceOrb";
import { LANGUAGES } from "../lib/types";
import { Button, Card, ErrorNote, focusCls, idleCls, inputCls, selectedCls } from "../lib/ui";

const DIALECT: Record<string, string> = { kn_en: "kn", hi_en: "hi", ta_en: "ta" };

const QUESTIONS = [
  { key: "business", prompt: "What is your business about?" },
  { key: "campaign", prompt: "What is the campaign or offer about?" },
  { key: "languages", prompt: "What languages do you want it in?" },
  { key: "audience", prompt: "Who is your target audience, and how do you want the ad to be?" },
  { key: "expectation", prompt: "What is your expectation from the ad?" },
] as const;

type QuestionKey = (typeof QUESTIONS)[number]["key"];

export interface DateChoice {
  label: string;
  event_date: string | null;
  occasion: string | null;
}

export interface SpeechBrief {
  transcript: string;
  product: string | null;
  offer: string | null;
  offer_options: string[];
  audience: string | null;
  goal: string | null;
  occasion: string | null;
  event_date: string | null;
  date_options: DateChoice[];
  tone: string | null;
  highlights: string | null;
  region: string | null;
  shop_region: string | null;
  region_clash: boolean;
  languages: string[];
  formats: Record<string, string[]>;
  platforms_without_formats: string[];
  unplaced: string | null;
}

export interface SpeechReady {
  transcript: string;
  note?: string;
  product?: string;
  offer?: string;
  audience?: string;
  goal?: string;
  occasion?: string;
  event_date?: string;
  tone?: string;
  highlights?: string;
  region?: string;
  languages: string[];
  codeSwitching: boolean;
  mode: "ai" | "user";
  formats: Record<string, string[]>;
  allowBlank: boolean;
}

type Answer = { text: string; brief: SpeechBrief | null };

function blankAnswers(): Record<QuestionKey, Answer> {
  return {
    business: { text: "", brief: null },
    campaign: { text: "", brief: null },
    languages: { text: "", brief: null },
    audience: { text: "", brief: null },
    expectation: { text: "", brief: null },
  };
}

function spokenLanguages(codes: string[]) {
  return [...new Set(codes.map((code) => DIALECT[code] ?? code))];
}

export function SpeechStart({
  shopRegion, platforms, platformLabels, formatCatalog, formatLabels, presets, onReady, onTypeInstead,
}: {
  shopRegion: string;
  platforms: string[];
  platformLabels: Record<string, string>;
  formatCatalog: Record<string, string[]>;
  formatLabels: Record<string, string>;
  presets: { label: string; formats: Record<string, string[]> }[];
  onReady: (ready: SpeechReady) => void;
  onTypeInstead: (ready: SpeechReady | null) => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(blankAnswers);
  const [languages, setLanguages] = useState<string[]>(["en"]);
  const [codeSwitching, setCodeSwitching] = useState(true);
  const [offerChoice, setOfferChoice] = useState("");
  const [mode, setMode] = useState<"ai" | "user">("user");
  const [formats, setFormats] = useState<Record<string, string[]>>({});
  const formatsSeeded = useRef(false);
  const [phase, setPhase] = useState<"idle" | "listening" | "writing">("idle");
  const [error, setError] = useState<unknown>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const choosingChannels = step === QUESTIONS.length;
  const question = QUESTIONS[Math.min(step, QUESTIONS.length - 1)];
  const answer = answers[question.key];

  function applyBrief(key: QuestionKey, text: string, brief: SpeechBrief) {
    setAnswers((current) => ({ ...current, [key]: { text, brief } }));
    if (key === "campaign") setOfferChoice("");
    if (key !== "languages") return;
    const spoken = spokenLanguages(brief.languages);
    setLanguages(spoken.length ? spoken : ["en"]);
    setCodeSwitching(brief.languages.some((code) => code.endsWith("_en")) || spoken.length > 1);
  }

  async function transcribe(key: QuestionKey) {
    if (phase === "listening") { recorder.current?.stop(); return; }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (event) => chunks.push(event.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setMicStream(null);
        setPhase("writing");
        const fd = new FormData();
        fd.append("file", new Blob(chunks, { type: rec.mimeType }), "voice.webm");
        try {
          const text = (await api.post<{ text: string }>("/voice/transcribe", fd)).text.trim();
          const brief = await api.post<SpeechBrief>("/voice/brief", { transcript: text, shop_region: shopRegion });
          applyBrief(key, text, brief);
          setPhase("idle");
        } catch (err) {
          setPhase("idle");
          setError(err instanceof Error ? err : new Error("Didn't catch that. Speak again, or type the answer."));
        }
      };
      recorder.current = rec;
      rec.start();
      setMicStream(stream);
      setPhase("listening");
    } catch {
      setPhase("idle");
      setError(new Error("The microphone didn't start. Speak again, or type the answer."));
    }
  }

  function collectedFormats() {
    const formats: Record<string, string[]> = {};
    for (const item of Object.values(answers)) {
      for (const [platform, list] of Object.entries(item.brief?.formats ?? {})) {
        formats[platform] = [...new Set([...(formats[platform] ?? []), ...list])];
      }
    }
    return formats;
  }

  function current(): SpeechReady {
    const campaign = answers.campaign;
    const audience = answers.audience.brief;
    const chosen = Object.fromEntries(Object.entries(formats).filter(([, list]) => list.length > 0));
    const note = QUESTIONS
      .map((item) => {
        const text = answers[item.key].text.trim();
        return text ? `${item.prompt}\n${text}` : "";
      })
      .filter(Boolean)
      .join("\n\n");
    return {
      transcript: note,
      note,
      product: campaign.text.trim() || undefined,
      offer: offerChoice || campaign.brief?.offer || undefined,
      audience: audience?.audience || answers.audience.text.trim() || undefined,
      goal: answers.expectation.text.trim() || undefined,
      occasion: campaign.brief?.occasion || undefined,
      event_date: campaign.brief?.event_date || undefined,
      tone: audience?.tone || undefined,
      highlights: answers.business.text.trim() || undefined,
      region: shopRegion || undefined,
      languages: languages.length ? languages : ["en"],
      codeSwitching,
      mode,
      formats: chosen,
      allowBlank: !campaign.text.trim(),
    };
  }

  async function continueFrom(index: number) {
    const asked = QUESTIONS[index];
    if (asked?.key === "languages") {
      const spoken = answers.languages;
      if (spoken.text.trim() && spoken.brief?.transcript !== spoken.text.trim()) {
        try {
          const brief = await api.post<SpeechBrief>("/voice/brief", { transcript: spoken.text.trim(), shop_region: shopRegion });
          applyBrief("languages", spoken.text.trim(), brief);
        } catch (err) {
          setError(err instanceof Error ? err : new Error("Couldn't read those languages. Pick them below."));
          return;
        }
      }
    }
    if (index < QUESTIONS.length - 1) {
      setStep(index + 1);
      return;
    }
    if (index === QUESTIONS.length - 1) {
      if (!formatsSeeded.current) {
        const spoken = collectedFormats();
        setMode("user");
        setFormats(Object.keys(spoken).length ? spoken : (presets[0]?.formats ?? {}));
        formatsSeeded.current = true;
      }
      setStep(QUESTIONS.length);
      return;
    }
    onReady(current());
  }

  const heardOffer = answers.campaign.brief?.offer_options ?? [];
  const chosenCount = Object.values(formats).reduce((count, list) => count + list.length, 0);
  const ready = choosingChannels
    ? mode === "ai" || chosenCount > 0
    : !!answer.text.trim() && (question.key !== "languages" || languages.length > 0);

  function toggleFormat(platform: string, fmt: string) {
    setFormats((current) => {
      const list = current[platform] ?? [];
      return { ...current, [platform]: list.includes(fmt) ? list.filter((item) => item !== fmt) : [...list, fmt] };
    });
  }

  return (
    <Card className="space-y-4">
      <div>
        <p className="text-xs font-medium text-slate-500">Step {step + 1} of {QUESTIONS.length + 1}</p>
        <h2 className="text-lg font-semibold">{choosingChannels ? "Which social networks?" : question.prompt}</h2>
        <p className="text-sm text-slate-500">
          {choosingChannels
            ? "Pick the networks and formats, the same as the typed form. Or let the AI decide."
            : "Answer out loud. If this isn't what you meant, speak again and it replaces this answer."}
        </p>
      </div>

      {choosingChannels && (
        <div className="space-y-4">
          <div className="flex gap-2 text-sm">
            <button type="button" onClick={() => setMode("user")} className={`rounded-lg px-3 py-1.5 text-sm ${focusCls} ${mode === "user" ? selectedCls : idleCls}`}>I'll choose</button>
            <button type="button" onClick={() => setMode("ai")} className={`rounded-lg px-3 py-1.5 text-sm ${focusCls} ${mode === "ai" ? selectedCls : idleCls}`}>Let the AI decide</button>
          </div>
          {mode === "user" && (
            <>
              <div className="flex flex-wrap gap-2">
                {presets.map((preset) => (
                  <button key={preset.label} type="button" onClick={() => setFormats(preset.formats)}
                    className={`rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50 ${focusCls}`}>{preset.label}</button>
                ))}
              </div>
              <div className="grid gap-2">
                {platforms.map((platform) => (
                  <div key={platform} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-28 font-medium">{platformLabels[platform] ?? platform}</span>
                    {(formatCatalog[platform] ?? []).map((fmt) => {
                      const on = (formats[platform] ?? []).includes(fmt);
                      return (
                        <button key={fmt} type="button" onClick={() => toggleFormat(platform, fmt)}
                          className={`rounded-lg px-2.5 py-1 text-xs ${focusCls} ${on ? selectedCls : idleCls}`}>
                          {formatLabels[fmt] ?? fmt}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {!choosingChannels && (
        <VoiceOrb phase={phase} stream={micStream} onClick={() => transcribe(question.key)}
          idleLabel={answer.text ? "Click to speak again" : "Click to answer"} />
      )}

      {!choosingChannels && answer.text && (
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">This is what I heard</span>
          <textarea className={inputCls} rows={3} value={answer.text}
            onChange={(event) => setAnswers((current) => ({
              ...current,
              [question.key]: { ...current[question.key], text: event.target.value },
            }))} />
        </label>
      )}

      {!choosingChannels && question.key === "campaign" && heardOffer.length > 1 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Two deals came up. Which one?</p>
          <div className="flex flex-wrap gap-2">
            {heardOffer.map((option) => (
              <button key={option} type="button" onClick={() => setOfferChoice(option)}
                className={`rounded-lg px-3 py-1.5 text-sm ${focusCls} ${offerChoice === option ? selectedCls : idleCls}`}>{option}</button>
            ))}
          </div>
        </div>
      )}

      {!choosingChannels && question.key === "languages" && (
        <div>
          <div className="mb-1 text-sm font-medium">Languages</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(LANGUAGES).map(([code, name]) => (
              <button key={code} type="button"
                onClick={() => setLanguages(languages.includes(code) ? languages.filter((item) => item !== code) : [...languages, code])}
                className={`rounded-lg px-2.5 py-1 text-xs ${focusCls} ${languages.includes(code) ? selectedCls : idleCls}`}>
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      <ErrorNote error={error} />
      <div className="flex flex-wrap justify-between gap-2">
        <div className="flex gap-2">
          <Button kind="ghost" disabled={step === 0 || phase === "writing"} onClick={() => setStep(step - 1)}>Back</Button>
          <Button kind="ghost" disabled={phase === "writing"} onClick={() => { setAnswers(blankAnswers()); setStep(0); setLanguages(["en"]); setFormats({}); setMode("user"); formatsSeeded.current = false; }}>Start over</Button>
        </div>
        <div className="flex gap-2">
          <Button kind="ghost" disabled={phase === "writing"} onClick={() => onTypeInstead(answer.text.trim() || step > 0 ? current() : null)}>Type it instead</Button>
          <Button disabled={!ready || phase !== "idle"} onClick={() => continueFrom(step)}>
            {step < QUESTIONS.length ? "Next" : "Check this"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
