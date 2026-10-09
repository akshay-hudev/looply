import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { api } from "../lib/api";
import { displayOffer } from "../lib/offer";
import { Brief, Business, OwnerFile, PLATFORM_LABELS, PLATFORMS } from "../lib/types";
import { InfoTip } from "../components/CampaignParts";
import { LOOP_GRADIENT } from "../components/fx";
import { PlatformIcon } from "../components/PlatformIcon";
import { ChipPicker, ChoiceCard, IconTiles, LanguagePicker, LivePoster, PlatformCards, StyleCards, Ticket, WizardRail } from "../components/WizardParts";
import { Button, DocumentTitle, ErrorNote, focusCls, idleCls, inputCls, selectedCls } from "../lib/ui";
import { SpeechReady, SpeechStart } from "./SpeechStart";

const FORMAT_CATALOG: Record<string, string[]> = {
  instagram: ["post", "story", "reel", "carousel", "poster"],
  whatsapp: ["message", "offer_card"],
  facebook: ["post"],
  linkedin: ["post"],
  youtube: ["post", "short"],
  x: ["post"],
};
const FORMAT_LABELS: Record<string, string> = {
  post: "Feed post", story: "Story card", reel: "Reel / video", carousel: "Carousel", poster: "Poster",
  message: "Message", offer_card: "Offer card", short: "Short",
};
const PRESETS: { label: string; formats: Record<string, string[]> }[] = [
  { label: "Poster + story + reel", formats: { instagram: ["poster", "story", "reel"] } },
  { label: "Instagram + WhatsApp", formats: { instagram: ["post", "story"], whatsapp: ["message", "offer_card"] } },
  { label: "Everything visual", formats: { instagram: ["post", "story", "reel", "carousel", "poster"], whatsapp: ["offer_card"] } },
];

interface DomainProfile {
  label: string;
  icon: string;
  highlightsPlaceholder: string;
  highlights: string[];
  occasions: string[];
  audiences: string[];
}

const DOMAIN_PROFILES: Record<string, DomainProfile> = {
  jewelry_fashion: {
    label: "Jewelry & Accessories",
    icon: "💍",
    highlightsPlaceholder: "e.g. handcrafted designs, pure oxidised silver, lightweight all-day comfort",
    highlights: [
      "Handcrafted designs",
      "Pure silver & oxidised",
      "Lightweight & all-day wear",
      "Traditional temple work",
      "Trendy modern daily wear",
      "Anti-tarnish & skin friendly",
      "Festive statement pieces",
      "Custom bridal collection",
      "Fast doorstep delivery",
      "Pocket-friendly luxury",
      "Nickel-free & hypoallergenic",
      "Intricate pearl detailing",
    ],
    occasions: [
      "Diwali & Navratri",
      "Wedding season & sangeet",
      "Grand new stock launch",
      "College fest & farewell",
      "Festival sale",
      "This weekend",
      "Valentine's & gifting",
      "Payday treat",
    ],
    audiences: [
      "College students",
      "Young professionals",
      "Brides & bridesmaids",
      "Ethnic fashion lovers",
      "Traditional jewelry lovers",
      "Gift shoppers",
      "Women looking for daily wear",
    ],
  },
  apparel_boutique: {
    label: "Fashion & Clothing",
    icon: "👗",
    highlightsPlaceholder: "e.g. pure handloom cotton, designer silhouettes, custom tailoring",
    highlights: [
      "Pure cotton & handloom",
      "Custom designer fit",
      "Trendy ethnic collection",
      "Comfortable all-day wear",
      "Exclusive festive prints",
      "Premium stitching quality",
      "Size inclusive (XS-5XL)",
      "Breathable organic fabrics",
      "Affordable chic",
      "New arrivals every week",
    ],
    occasions: [
      "Festive collection launch",
      "Wedding season",
      "Diwali sale",
      "Weekend shopping",
      "Summer & cotton special",
      "College fest",
      "End of season sale",
    ],
    audiences: [
      "Fashion-conscious women",
      "College students",
      "Working professionals",
      "Ethnic wear lovers",
      "Budget shoppers",
      "Brides & wedding guests",
    ],
  },
  food_cafe: {
    label: "Cafe & Restaurant",
    icon: "☕",
    highlightsPlaceholder: "e.g. wood-fired oven, rooftop seating, signature cold brew",
    highlights: [
      "Wood-fired oven",
      "Freshly brewed specialty coffee",
      "Rooftop cozy seating",
      "Locally sourced ingredients",
      "Live acoustic music",
      "Chef's special combos",
      "Pet friendly outdoor area",
      "100% pure vegetarian",
      "Late night delivery",
      "Pocket friendly meals",
    ],
    occasions: [
      "This weekend",
      "Sunday brunch special",
      "Grand opening",
      "Festive feast",
      "IPL / sports screening",
      "Payday weekend",
      "Monsoon chai & snacks",
    ],
    audiences: [
      "College students",
      "Young professionals",
      "Families with kids",
      "Couples on date night",
      "Foodies & food bloggers",
      "Remote workers / coffee lovers",
      "Office lunch crowd",
    ],
  },
  salon_spa: {
    label: "Salon & Beauty Spa",
    icon: "💇",
    highlightsPlaceholder: "e.g. certified hair stylists, organic keratin, bridal makeover",
    highlights: [
      "Certified senior stylists",
      "Organic & chemical-free products",
      "Bridal makeover packages",
      "100% sanitized & hygienic",
      "Painless skin & laser treatments",
      "Relaxing aromatherapy ambience",
      "Custom scalp & hair rituals",
      "Complimentary skin consultation",
    ],
    occasions: [
      "Wedding season preparation",
      "Festive glow-up (Diwali)",
      "Weekend self-care",
      "College farewell glow",
      "Pre-holiday package",
      "Monsoon hair spa offer",
    ],
    audiences: [
      "Working women & men",
      "Brides-to-be",
      "College students",
      "Busy professionals",
      "Self-care enthusiasts",
    ],
  },
  fitness_gym: {
    label: "Gym & Fitness",
    icon: "🏋️",
    highlightsPlaceholder: "e.g. certified personal trainers, imported equipment, custom diet plans",
    highlights: [
      "Certified personal trainers",
      "Modern imported equipment",
      "Custom diet & nutrition plans",
      "Flexible workout timings",
      "Zumba & yoga batches",
      "Clean locker & shower facilities",
      "Beginner-friendly guidance",
      "Body transformation challenges",
    ],
    occasions: [
      "New Year fitness resolution",
      "Summer shred challenge",
      "Annual membership discount",
      "Payday fitness offer",
      "World Health Day",
      "Back to gym offer",
    ],
    audiences: [
      "Fitness enthusiasts",
      "College students",
      "Working professionals",
      "Weight loss seekers",
      "Beginners to fitness",
    ],
  },
  health_clinic: {
    label: "Clinic & Healthcare",
    icon: "🩺",
    highlightsPlaceholder: "e.g. experienced doctors, painless dentistry, advanced diagnostics",
    highlights: [
      "Experienced specialist doctors",
      "Painless modern procedures",
      "Advanced diagnostic equipment",
      "Zero waiting appointment time",
      "100% sterilized clinical setup",
      "Affordable family health packages",
      "Emergency consultation available",
    ],
    occasions: [
      "Health checkup camp",
      "World Oral Health Day",
      "Senior citizen health week",
      "Annual family wellness check",
      "Monsoon immunity package",
    ],
    audiences: [
      "Families",
      "Senior citizens",
      "Working parents",
      "Health-conscious individuals",
      "Local community residents",
    ],
  },
  bakery_dessert: {
    label: "Bakery & Desserts",
    icon: "🍰",
    highlightsPlaceholder: "e.g. freshly baked daily, 100% eggless options, custom designer cakes",
    highlights: [
      "Freshly baked daily from scratch",
      "100% pure eggless options",
      "Customized celebration cakes",
      "Pure Belgian chocolate ganache",
      "Zero artificial preservatives",
      "Same-day express delivery",
      "Artisanal sourdough & pastries",
      "Tea-time snack hampers",
    ],
    occasions: [
      "Birthday & anniversary",
      "Festive dessert boxes",
      "Diwali gifting",
      "Weekend sweet cravings",
      "Valentine's day special",
      "Christmas & New Year cakes",
    ],
    audiences: [
      "Dessert lovers & foodies",
      "Families celebrating milestones",
      "Corporate gifting teams",
      "College youth",
      "Parents planning kids parties",
    ],
  },
  general_retail: {
    label: "General & Retail",
    icon: "✨",
    highlightsPlaceholder: "e.g. handcrafted with love, premium quality, fast doorstep delivery",
    highlights: [
      "Premium certified quality",
      "Handcrafted with love",
      "Fast & secure delivery",
      "100% genuine & verified",
      "Easy exchange & returns policy",
      "Pocket-friendly affordable pricing",
      "Loved by 5,000+ local customers",
      "Personalized customer support",
      "Eco-friendly packaging",
    ],
    occasions: [
      "Grand opening",
      "Diwali & festive mega sale",
      "This weekend special",
      "Payday special offer",
      "End of season clearance",
      "Limited edition launch",
    ],
    audiences: [
      "Local residents nearby",
      "College students",
      "Young professionals",
      "Families",
      "Budget shoppers",
      "Gift buyers",
    ],
  },
};

function detectDomain(name?: string | null, category?: string | null, product?: string | null): string {
  const text = `${name ?? ""} ${category ?? ""} ${product ?? ""}`.toLowerCase();

  // Jewelry, accessories, jhumkas, ornaments
  if (/jhumka|jewel|ornament|earring|necklace|bangle|silver|gold|accessories|pendant|choker|anklet|gem|kundan|polki|oxidised/i.test(text)) {
    return "jewelry_fashion";
  }

  // Apparel, boutique, clothing, sarees, ethnic wear
  if (/saree|kurti|dress|boutique|cloth|apparel|textile|tailor|suit|ethnic|wear|attire|garment/i.test(text)) {
    return "apparel_boutique";
  }

  // Bakery, cakes, sweets, dessert
  if (/cake|bakery|bake|pastry|dessert|sweet|mithai|chocolate|cookie|cupcake/i.test(text)) {
    return "bakery_dessert";
  }

  // Cafe, restaurant, food, dining, kitchen, bar
  if (/cafe|coffee|tea|restaurant|food|kitchen|dine|bistro|pizzeria|pizza|burger|snack|tiffin|dhaba|biryani|bar\b/i.test(text)) {
    return "food_cafe";
  }

  // Salon, spa, beauty, makeup, parlour
  if (/salon|spa|beauty|parlour|parlor|hair|skin|nail|makeup|grooming|lash|facial/i.test(text)) {
    return "salon_spa";
  }

  // Gym, fitness, yoga, sports
  if (/gym|fit|fitness|workout|yoga|pilates|crossfit|martial|trainer|sports/i.test(text)) {
    return "fitness_gym";
  }

  // Clinic, doctor, dental, healthcare, pharmacy
  if (/clinic|dental|dentist|doctor|health|care|hospital|physio|pharma|medical|eye\b/i.test(text)) {
    return "health_clinic";
  }

  return "general_retail";
}

function getCustomNameKeywords(name?: string | null): string[] {
  if (!name) return [];
  const lower = name.trim().toLowerCase();
  const suggestions: string[] = [];
  if (/jhumka/i.test(lower)) {
    suggestions.push("Signature jhumka designs", "Traditional & modern jhumkas");
  }
  if (/palace/i.test(lower)) {
    suggestions.push("Royal heritage collection");
  }
  if (/studio|boutique/i.test(lower)) {
    suggestions.push("Exclusive studio collection", "Designer handcrafted pieces");
  }
  if (/craft|art/i.test(lower)) {
    suggestions.push("Artisan handcrafted", "Unique bespoke craftsmanship");
  }
  if (/silver/i.test(lower)) {
    suggestions.push("925 sterling silver", "Hallmark certified");
  }
  if (/organics?|nature|herb/i.test(lower)) {
    suggestions.push("100% natural & organic", "Chemical-free ingredients");
  }
  return suggestions;
}

const GOALS = [
  "Make people aware we exist", "More walk-in visits", "More orders / enquiries",
  "Fill the weekend", "Promote an offer", "Launch something new", "Build brand loyalty",
];
const TONES = [
  "Fun & youthful", "Warm & friendly", "Premium & elegant",
  "Bold & energetic", "Calm & trustworthy", "Witty & quirky",
];
const STEPS = [
  { label: "Shop", icon: "🏪" }, { label: "Offer", icon: "🏷️" }, { label: "Who", icon: "👥" },
  { label: "Where", icon: "📣" }, { label: "Check", icon: "🎟️" },
];
const GOAL_ICONS: Record<string, string> = {
  "Make people aware we exist": "👀", "More walk-in visits": "🚶", "More orders / enquiries": "📞",
  "Fill the weekend": "📅", "Promote an offer": "🏷️", "Launch something new": "🚀", "Build brand loyalty": "❤️",
};
const TONE_ICONS: Record<string, string> = {
  "Fun & youthful": "😄", "Warm & friendly": "🤝", "Premium & elegant": "💎",
  "Bold & energetic": "⚡", "Calm & trustworthy": "🛡️", "Witty & quirky": "😜",
};


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
  const [files, setFiles] = useState<OwnerFile[]>([]);
  const [mode, setMode] = useState<"ai" | "user">("user");
  const [formats, setFormats] = useState<Record<string, string[]>>(PRESETS[0].formats);
  const [languages, setLanguages] = useState<string[]>(["en"]);
  const [codeSwitching, setCodeSwitching] = useState(true);
  const [codeSwitchingStyle, setCodeSwitchingStyle] = useState<"kanglish_hinglish" | "native_pure">("kanglish_hinglish");
  const [skipReview, setSkipReview] = useState(false);
  const [allowBlank, setAllowBlank] = useState(false);
  const [screen, setScreen] = useState<"form" | "speak">("form");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [userSelectedDomain, setUserSelectedDomain] = useState<string | null>(null);
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

  // Context-aware industry profile and keyword suggestions
  const detectedDomainKey = detectDomain(biz?.name, biz?.category, brief.product);
  const activeDomainKey = userSelectedDomain || detectedDomainKey;
  const activeProfile = DOMAIN_PROFILES[activeDomainKey] || DOMAIN_PROFILES.general_retail;
  const customNameKeywords = getCustomNameKeywords(biz?.name);
  const contextualHighlights = [...new Set([...customNameKeywords, ...activeProfile.highlights])];
  const contextualOccasions = activeProfile.occasions;
  const contextualAudiences = activeProfile.audiences;

  const set = (k: keyof Brief) => (v: string) => setBrief((b) => ({ ...b, [k]: v || undefined }));
  const chosen = Object.fromEntries(Object.entries(formats).filter(([, v]) => v.length));
  const formatsReady = mode === "ai" || Object.keys(chosen).length > 0;
  const named = !!brief.product?.trim();
  const canNext = [!!businessId, named || allowBlank, true, formatsReady && languages.length > 0, true][step];
  const product = brief.product?.trim();


  function pourSpeech(ready: SpeechReady, nextStep: number) {
    const dialect: Record<string, string> = { kn_en: "kn", hi_en: "hi", ta_en: "ta" };
    const spokenLanguages = [...new Set(ready.languages.map((code) => dialect[code] ?? code))];
    setBrief((current) => ({
      ...current,
      product: ready.product,
      offer: ready.offer,
      audience: ready.audience,
      goal: ready.goal,
      occasion: ready.occasion,
      event_date: ready.event_date,
      tone: ready.tone,
      highlights: ready.highlights,
      region: ready.region || current.region,
    }));
    setLanguages(spokenLanguages.length ? spokenLanguages : ["en"]);
    setCodeSwitching(ready.codeSwitching);
    setCodeSwitchingStyle(ready.codeSwitching ? "kanglish_hinglish" : "native_pure");
    setMode(ready.mode);
    if (ready.mode === "user") setFormats(ready.formats);
    setMessage(ready.note?.trim() || ready.transcript);
    setAllowBlank(ready.allowBlank);
    setScreen("form");
    setStep(nextStep);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ id: string }>("/campaigns", {
        business_id: businessId,
        message,
        brief,
        attachments: files,
        content_mode: mode,
        requested_formats: mode === "user" ? chosen : {},
        requested_languages: languages,
        code_switching: codeSwitching,
        code_switching_style: codeSwitchingStyle,
        auto_accept_strategy: skipReview,
      });
      nav(`/campaigns/${res.id}`);
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  const nextLabel = [
    biz ? `Continue with ${biz.name}` : "Continue",
    "Next: who it's for",
    "Next: where it goes",
    product ? `Review ${product}` : "Review this",
  ][step];

  const details = [brief.product, brief.offer, brief.event_date || brief.occasion, brief.audience, brief.goal, brief.tone, brief.highlights, brief.region];
  const filled = details.filter((d) => !!d?.trim()).length;
  const chosenPlatforms = Object.keys(chosen);
  const formatCount = Object.values(chosen).reduce((n, list) => n + list.length, 0);
  const when = [brief.occasion, brief.event_date ? fmtDate(brief.event_date) : ""].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <DocumentTitle title={biz?.name ?? "New campaign"} />
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">New campaign</p>
        <h1 className="font-display text-5xl leading-none text-slate-900">{biz?.name ?? "Pick a shop"}</h1>
        {biz && <p className="mt-1 text-sm text-slate-600">{[biz.category, biz.city].filter(Boolean).join(" · ")}</p>}
      </div>
      {screen === "form" && <WizardRail steps={STEPS} step={step} onJump={(i) => i < step && setStep(i)} />}

      {screen === "speak" && (
        <SpeechStart
          shopRegion={brief.region || [biz?.address, biz?.city].filter(Boolean).join(", ")}
          platforms={[...PLATFORMS]}
          platformLabels={PLATFORM_LABELS}
          formatCatalog={FORMAT_CATALOG}
          formatLabels={FORMAT_LABELS}
          presets={PRESETS}
          onReady={(ready) => pourSpeech(ready, 4)}
          onTypeInstead={(ready) => ready ? pourSpeech(ready, 1) : (setScreen("form"), setStep(1))}
        />
      )}

      {screen === "form" && (
      <div className={step > 0 ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" : ""}>
        <div className="space-y-5">
          {step === 0 && (
            <section className="lm-card space-y-6 rounded-3xl border bg-white p-5 sm:p-6">
              <StepHead title="Which shop?" />
              {businesses.isLoading ? <p className="text-sm text-slate-600">Loading businesses</p>
                : businesses.isError ? <ErrorNote error={new Error("Couldn't load your businesses. Try again.")} />
                : (businesses.data ?? []).length === 0 ? (
                <p className="text-sm text-amber-800">Add the place you're promoting first. <Link className="underline" to="/businesses/new">Add a business</Link>.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(businesses.data ?? []).map((b) => {
                    const on = businessId === b.id;
                    const dom = DOMAIN_PROFILES[detectDomain(b.name, b.category)] ?? DOMAIN_PROFILES.general_retail;
                    return (
                      <button key={b.id} type="button" aria-pressed={on} onClick={() => setBusinessId(b.id)}
                        className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition duration-200 motion-reduce:transition-none ${focusCls} ${on ? "border-brand-600 bg-brand-50 shadow-md" : "border-[#f1e3d1] bg-white hover:-translate-y-0.5 hover:border-brand-300 dark:border-[#292524]"}`}>
                        <span aria-hidden="true" className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-display text-2xl text-[#ffffff]" style={{ backgroundImage: LOOP_GRADIENT }}>
                          {[...b.name.trim()][0]?.toUpperCase()}
                          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm shadow">{dom.icon}</span>
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-900">{b.name}</span>
                          <span className="block truncate text-xs text-slate-500">{[b.category, b.city].filter(Boolean).join(" · ") || "No details yet"}</span>
                        </span>
                      </button>
                    );
                  })}
                  <Link to="/businesses/new" className={`flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#e7d8c6] p-3 text-sm font-medium text-slate-600 hover:border-brand-300 hover:text-slate-900 dark:border-[#292524] ${focusCls}`}>
                    <span aria-hidden="true" className="text-lg">＋</span> Add a business
                  </Link>
                </div>
              )}
              {businessId && (
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-900">How do you want to tell us?</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ChoiceCard icon="🎤" title="Say it" line="Answer 5 quick questions out loud." on={false} onClick={() => setScreen("speak")} />
                    <ChoiceCard icon="⌨️" title="Type it" line="Fill in the details step by step." on={false} onClick={() => setStep(1)} />
                  </div>
                </div>
              )}
            </section>
          )}

          {step === 1 && (
            <section className="lm-card space-y-6 rounded-3xl border bg-white p-5 sm:p-6">
              <StepHead title="What's the offer?" tip="The offer, date and what makes you special stay locked. LOOPLY never invents a price." />
              <label className="block">
                <span className="text-sm font-semibold text-slate-900">🛍️ Promoting</span>
                <input className={`${inputCls} mt-1.5 py-3 text-base`} value={brief.product ?? ""} onChange={(e) => set("product")(e.target.value)}
                  placeholder="e.g. New stock launch, Diwali sweets box" />
              </label>
              {!named && (
                <label className="-mt-3 flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={allowBlank} onChange={(e) => setAllowBlank(e.target.checked)} />
                  Skip naming it (the posts stay general)
                </label>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-900">🏷️ Offer or price</span>
                  <input className={`${inputCls} mt-1.5`} value={brief.offer ?? ""} onChange={(e) => set("offer")(e.target.value)} placeholder="e.g. 15% off, ₹149, Buy 1 Get 1" />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-900">📅 Date</span>
                  <input type="date" className={`${inputCls} mt-1.5`} value={brief.event_date ?? ""} onChange={(e) => set("event_date")(e.target.value)} />
                </label>
              </div>
              <div className="space-y-2">
                <span className="text-sm font-semibold text-slate-900">🎉 Occasion</span>
                <input aria-label="Occasion" className={inputCls} value={brief.occasion ?? ""} onChange={(e) => set("occasion")(e.target.value)} placeholder="Type, or tap below" />
                <ChipPicker label="Occasion ideas" options={contextualOccasions} value={brief.occasion} onPick={set("occasion")} />
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">✨ What makes you special</span>
                  <label className="lm-glass inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-slate-700">
                    <span aria-hidden="true">{activeProfile.icon}</span>
                    <select aria-label="Suggestions for" value={activeDomainKey}
                      onChange={(e) => setUserSelectedDomain(e.target.value === detectedDomainKey ? null : e.target.value)}
                      className="bg-transparent font-semibold text-slate-900 outline-none">
                      {Object.entries(DOMAIN_PROFILES).map(([key, dom]) => <option key={key} value={key}>{dom.label}</option>)}
                    </select>
                  </label>
                </div>
                <input aria-label="What makes you special" className={inputCls} value={brief.highlights ?? ""} onChange={(e) => set("highlights")(e.target.value)} placeholder={activeProfile.highlightsPlaceholder} />
                <ChipPicker label="Specialty ideas" options={contextualHighlights} value={brief.highlights} onPick={set("highlights")} />
              </div>
              <AttachFiles files={files} onChange={setFiles} />
            </section>
          )}

          {step === 2 && (
            <section className="lm-card space-y-6 rounded-3xl border bg-white p-5 sm:p-6">
              <StepHead title={product ? `Who is ${product} for?` : "Who is it for?"} />
              <div className="space-y-2">
                <span className="text-sm font-semibold text-slate-900">👥 Audience</span>
                <input aria-label="Audience" className={inputCls} value={brief.audience ?? ""} onChange={(e) => set("audience")(e.target.value)} placeholder="Type, or tap below" />
                <ChipPicker label="Audience ideas" options={contextualAudiences} value={brief.audience} onPick={set("audience")} />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-semibold text-slate-900">🎯 Goal</span>
                <IconTiles label="Goal" value={brief.goal} onPick={set("goal")} options={GOALS.map((g) => ({ label: g, icon: GOAL_ICONS[g] ?? "🎯" }))} />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-semibold text-slate-900">🗣️ Tone</span>
                <IconTiles label="Tone" value={brief.tone} onPick={set("tone")} columns="grid-cols-2 sm:grid-cols-3"
                  options={TONES.map((t) => ({ label: t, icon: TONE_ICONS[t] ?? "🙂" }))} />
              </div>
              <label className="block">
                <span className="text-sm font-semibold text-slate-900">📍 Where</span>
                <input className={`${inputCls} mt-1.5`} value={brief.region ?? ""} onChange={(e) => set("region")(e.target.value)} placeholder="e.g. Indiranagar, Bengaluru" />
              </label>
              <details className="rounded-2xl bg-[#fdf1e4] px-4 py-3 dark:bg-[#1c1917]">
                <summary className={`cursor-pointer text-sm font-semibold text-slate-700 ${focusCls}`}>✍️ Add a note in your own words</summary>
                <div className="mt-3 space-y-2">
                  <textarea className={inputCls} rows={3} value={message} onChange={(e) => setMessage(e.target.value)}
                    aria-label="Anything else, in your own words" placeholder="We just opened, we want more people to know about us…" />
                  <VoiceButton onText={(t) => setMessage((m) => (m ? `${m} ${t}` : t))} />
                </div>
              </details>
            </section>
          )}

          {step === 3 && (
            <section className="lm-card space-y-6 rounded-3xl border bg-white p-5 sm:p-6">
              <StepHead title="Where should it go?" />
              <div className="grid gap-3 sm:grid-cols-2">
                <ChoiceCard icon="👆" title="I'll choose" line="Pick the platforms and formats." on={mode === "user"} onClick={() => setMode("user")} />
                <ChoiceCard icon="✨" title="Let the AI decide" line="Best mix for your goal." on={mode === "ai"} onClick={() => setMode("ai")} />
              </div>
              {mode === "user" && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                      <button key={p.label} type="button" onClick={() => setFormats(p.formats)}
                        className={`lm-glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-slate-800 hover:text-slate-900 ${focusCls}`}>
                        <span className="flex items-center gap-0.5">{Object.keys(p.formats).map((pl) => <PlatformIcon key={pl} platform={pl} className="h-3.5 w-3.5 text-slate-900" />)}</span>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <PlatformCards platforms={[...PLATFORMS]} catalog={FORMAT_CATALOG} formatLabels={FORMAT_LABELS} formats={formats} onChange={setFormats} />
                </>
              )}
              <div className="space-y-2">
                <span className="text-sm font-semibold text-slate-900">💬 How regional languages read</span>
                <StyleCards mixed={codeSwitching} onChange={(mixed) => { setCodeSwitching(mixed); setCodeSwitchingStyle(mixed ? "kanglish_hinglish" : "native_pure"); }} />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-semibold text-slate-900">🌐 Languages {languages.length === 0 && <span className="font-normal text-amber-800">· pick at least one</span>}</span>
                <LanguagePicker value={languages} onChange={setLanguages} />
              </div>
            </section>
          )}

          {step === 4 && (
            <Ticket
              shop={biz?.name ?? ""}
              offer={brief.offer?.trim() ? displayOffer(brief.offer) : "No deal"}
              product={product || "This promotion"}
              aiPicks={mode === "ai"}
              platforms={chosenPlatforms}
              languages={languages}
              formatCount={formatCount}
              chips={[
                { icon: "📅", label: "When", value: when },
                { icon: "👥", label: "For", value: brief.audience },
                { icon: "🎯", label: "Goal", value: brief.goal },
                { icon: "🗣️", label: "Tone", value: brief.tone },
                { icon: "✨", label: "Special", value: brief.highlights },
                { icon: "📍", label: "Where", value: brief.region },
                { icon: "💬", label: "Style", value: codeSwitching ? "Everyday mix" : "Pure script" },
                { icon: "📎", label: "Files", value: files.length ? `${files.length} attached` : "" },
                { icon: "✍️", label: "Note", value: message.trim() ? (message.length > 40 ? `${message.slice(0, 40)}…` : message) : "" },
              ]}
              footer={(
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button type="button" role="switch" aria-checked={skipReview} onClick={() => setSkipReview(!skipReview)}
                    className={`flex items-center gap-2.5 rounded-xl text-sm text-slate-700 ${focusCls}`}>
                    <span aria-hidden="true" className={`relative h-6 w-10 rounded-full transition-colors ${skipReview ? "bg-brand-700" : "bg-[#e7d8c6] dark:bg-[#292524]"}`}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${skipReview ? "left-[1.1rem]" : "left-0.5"}`} />
                    </span>
                    Skip the plan review
                  </button>
                  <ErrorNote error={error} />
                </div>
              )}
            />
          )}

          {step > 0 && (
            <div className="flex justify-between gap-2">
              <Button kind="ghost" onClick={() => setStep(step - 1)}>Back</Button>
              {step < STEPS.length - 1
                ? <Button disabled={!canNext} onClick={() => setStep(step + 1)}>{nextLabel} →</Button>
                : <Button disabled={busy || !businessId || (!named && !allowBlank)} onClick={submit}>{busy ? "Starting…" : `✨ Generate for ${biz?.name ?? "this shop"}`}</Button>}
            </div>
          )}
        </div>

        {step > 0 && (
          <LivePoster
            shop={biz?.name ?? ""}
            product={product}
            offer={brief.offer?.trim() ? displayOffer(brief.offer) : undefined}
            when={when || undefined}
            audience={brief.audience}
            special={brief.highlights}
            platforms={chosenPlatforms}
            aiPicks={mode === "ai"}
            languages={languages}
            filled={filled}
            total={details.length}
          />
        )}
      </div>
      )}
    </div>
  );
}

function fmtDate(iso: string) {
  const at = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(at.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" }).format(at);
}

function StepHead({ title, tip }: { title: string; tip?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-display text-3xl leading-tight text-slate-900">{title}</h2>
      {tip && <InfoTip label="Locked facts">{tip}</InfoTip>}
    </div>
  );
}

const FILE_ROLE: Record<OwnerFile["kind"], string> = {
  image: "Sample image", text: "Note", audio: "Voice", file: "File",
};

function AttachFiles({ files, onChange }: { files: OwnerFile[]; onChange: (files: OwnerFile[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setError(null);
    try {
      const added: OwnerFile[] = [];
      for (const file of Array.from(list)) {
        const fd = new FormData();
        fd.append("file", file);
        added.push(await api.post<OwnerFile>("/campaigns/attachments", fd));
      }
      onChange([...files, ...added].slice(0, 8));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't attach that file.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => add(e.target.files)} />
      <button type="button" disabled={busy || files.length >= 8} onClick={() => input.current?.click()}
        className={`flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#e7d8c6] px-4 py-3 text-sm font-medium text-slate-600 hover:border-brand-300 hover:text-slate-900 disabled:opacity-60 dark:border-[#292524] ${focusCls}`}>
        <span aria-hidden="true">📎</span>{busy ? "Attaching…" : "Attach a logo, photo or note"}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f) => (
            <li key={f.url} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2 text-sm">
              {f.kind === "image"
                ? <img src={f.url} alt="" className="h-12 w-12 rounded object-cover" />
                : <span className="flex h-12 w-12 items-center justify-center rounded bg-slate-100 text-[10px] uppercase text-slate-600">{f.kind}</span>}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{f.filename}</div>
                <div className="text-xs text-slate-500">{f.role === "logo" ? "Logo" : FILE_ROLE[f.kind]}</div>
                {f.text && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{f.text}</p>}
                {f.kind === "image" && (
                  <div className="mt-1 flex gap-1">
                    <button type="button" className={`rounded-full px-2 py-0.5 text-xs ${focusCls} ${f.role === "logo" ? selectedCls : idleCls}`}
                      onClick={() => onChange(files.map((x) => x.url === f.url ? { ...x, role: "logo" } : x))}>Logo</button>
                    <button type="button" className={`rounded-full px-2 py-0.5 text-xs ${focusCls} ${f.role === "sample" ? selectedCls : idleCls}`}
                      onClick={() => onChange(files.map((x) => x.url === f.url ? { ...x, role: "sample" } : x))}>Sample</button>
                  </div>
                )}
              </div>
              <button type="button" className={`text-xs text-slate-600 underline ${focusCls}`}
                onClick={() => onChange(files.filter((x) => x.url !== f.url))}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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
