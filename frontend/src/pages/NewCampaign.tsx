import { useQuery } from "@tanstack/react-query";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { api } from "../lib/api";
import { displayOffer } from "../lib/offer";
import { Brief, Business, LANGUAGES, OwnerFile, PLATFORM_LABELS, PLATFORMS } from "../lib/types";
import { Button, Card, DocumentTitle, ErrorNote, Field, focusCls, idleCls, inputCls, selectedCls, Stepper } from "../lib/ui";

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
  const [files, setFiles] = useState<OwnerFile[]>([]);
  const [mode, setMode] = useState<"ai" | "user">("user");
  const [formats, setFormats] = useState<Record<string, string[]>>(PRESETS[0].formats);
  const [languages, setLanguages] = useState<string[]>(["en"]);
  const [codeSwitching, setCodeSwitching] = useState(true);
  const [codeSwitchingStyle, setCodeSwitchingStyle] = useState<"kanglish_hinglish" | "native_pure">("kanglish_hinglish");
  const [skipReview, setSkipReview] = useState(false);
  const [allowBlank, setAllowBlank] = useState(false);
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

  function toggleFormat(platform: string, fmt: string) {
    const cur = formats[platform] ?? [];
    setFormats({ ...formats, [platform]: cur.includes(fmt) ? cur.filter((f) => f !== fmt) : [...cur, fmt] });
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
              <StepTitle title={`What is ${biz?.name ?? "this shop"} promoting?`} hint="The offer, date, and what makes you special stay locked. We never invent a price. Click multiple options to provide richer details." />
              <Field label="What are you promoting?">
                <input className={inputCls} value={brief.product ?? ""} onChange={(e) => set("product")(e.target.value)}
                  placeholder={`e.g. New Stock Launch, our signature ${biz?.name ? `${biz.name} collection` : "collection"}`} />
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
                <div>
                  <Field label="Offer or price">
                    <input className={inputCls} value={brief.offer ?? ""} onChange={(e) => set("offer")(e.target.value)} placeholder="e.g. 15% off on orders above 900, ₹149, Buy 1 Get 1" />
                  </Field>
                </div>
                <div>
                  <Field label="Date">
                    <input type="date" className={inputCls} value={brief.event_date ?? ""} onChange={(e) => set("event_date")(e.target.value)} />
                  </Field>
                </div>
              </div>

              {/* Occasion */}
              <div className="space-y-2">
                <Field label="Occasion (Select multiple or type)">
                  <input className={inputCls} value={brief.occasion ?? ""} onChange={(e) => set("occasion")(e.target.value)} placeholder="e.g. festive season, Diwali, this weekend" />
                </Field>
                <Chips options={contextualOccasions} value={brief.occasion} onPick={set("occasion")} />
              </div>

              {/* Context-aware What makes you special */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-sm font-medium text-slate-700">What makes you special? (Select multiple or type)</span>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs text-brand-800 ring-1 ring-brand-200">
                    <span>{activeProfile.icon}</span>
                    <span className="font-semibold">{activeProfile.label}</span>
                    {biz?.name && <span className="text-slate-500 font-normal">matched for {biz.name}</span>}
                  </div>
                </div>

                {/* Industry preset switcher */}
                <div className="flex flex-wrap items-center gap-1.5 pb-1">
                  <span className="text-[11px] font-medium text-slate-500">Keywords category:</span>
                  {Object.entries(DOMAIN_PROFILES).map(([key, dom]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setUserSelectedDomain(key === activeDomainKey && userSelectedDomain ? null : key)}
                      className={`rounded-full px-2 py-0.5 text-[11px] transition-colors ${focusCls} ${
                        activeDomainKey === key
                          ? "bg-brand-600 font-medium text-white shadow-sm ring-1 ring-brand-700"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {dom.icon} {dom.label}
                    </button>
                  ))}
                  {userSelectedDomain && (
                    <button
                      type="button"
                      onClick={() => setUserSelectedDomain(null)}
                      className="text-[11px] text-slate-500 underline hover:text-slate-800"
                    >
                      ↺ Auto-detect
                    </button>
                  )}
                </div>

                <input
                  className={inputCls}
                  value={brief.highlights ?? ""}
                  onChange={(e) => set("highlights")(e.target.value)}
                  placeholder={activeProfile.highlightsPlaceholder}
                />
                <Chips options={contextualHighlights} value={brief.highlights} onPick={set("highlights")} />
              </div>
              <AttachFiles files={files} onChange={setFiles} />
            </Card>
          )}

          {step === 2 && (
            <Card className="space-y-4">
              <StepTitle title={product ? `Who is ${product} for?` : "Who is this for?"} hint={`${biz?.name ?? "The shop"} already has a place. You can select multiple audiences, goals and tones to give the agent full context.`} />
              <div className="space-y-2">
                <Field label="Who is it for? (Select multiple or type)">
                  <input className={inputCls} value={brief.audience ?? ""} onChange={(e) => set("audience")(e.target.value)}
                    placeholder="e.g. college students, young professionals, brides & bridesmaids" />
                </Field>
                <Chips options={contextualAudiences} value={brief.audience} onPick={set("audience")} />
              </div>
              <div className="space-y-2">
                <Field label="What do you want to achieve? (Select multiple or type)">
                  <input className={inputCls} value={brief.goal ?? ""} onChange={(e) => set("goal")(e.target.value)}
                    placeholder="e.g. make people aware we exist, more walk-in visits" />
                </Field>
                <Chips options={GOALS} value={brief.goal} onPick={set("goal")} />
              </div>
              <div className="space-y-2">
                <div className="mb-1 text-sm font-medium text-slate-700">Tone (Select multiple or custom)</div>
                <input className={inputCls} value={brief.tone ?? ""} onChange={(e) => set("tone")(e.target.value)}
                  placeholder="e.g. Fun & youthful, Warm & friendly" />
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
                  <AttachFiles files={files} onChange={setFiles} />
                </div>
              </details>
            </Card>
          )}

          {step === 3 && (
            <Card className="space-y-5">
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
                        <span className="w-28 font-medium">{PLATFORM_LABELS[p] ?? p}</span>
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

              {/* Translation & Dialect Preference */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Translation & Localization Style</div>
                  <p className="text-xs text-slate-500">Choose whether translations should use conversational code-switching (Kanglish, Hinglish) or pure native script.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCodeSwitching(true);
                      setCodeSwitchingStyle("kanglish_hinglish");
                    }}
                    className={`rounded-xl border p-3 text-left transition-colors ${focusCls} ${
                      codeSwitching
                        ? "border-brand-600 bg-brand-50/70 ring-1 ring-brand-600"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <span>⚡</span> Kanglish / Hinglish / Tanglish
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      Conversational code-switching with natural English loanwords (e.g. <i>"Weekend alli best coffee ide"</i>, <i>"Super discount on all orders"</i>). Best for youth and social media.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCodeSwitching(false);
                      setCodeSwitchingStyle("native_pure");
                    }}
                    className={`rounded-xl border p-3 text-left transition-colors ${focusCls} ${
                      !codeSwitching
                        ? "border-brand-600 bg-brand-50/70 ring-1 ring-brand-600"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <span>📖</span> Pure Native Script
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      Traditional, culturally authentic pure native language script without English loanwords or transliterations.
                    </p>
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-1 text-sm font-medium">Target Languages (Select all that apply)</div>
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
                <Row k="Audience" v={brief.audience} />
                <Row k="Goal" v={brief.goal} />
                <Row k="Tone" v={brief.tone} />
                <Row k="Where" v={brief.region} />
                <Row k="Translation style" v={codeSwitching ? "Kanglish / Hinglish / Tanglish (Code-Switching)" : "Pure Native Script (Kannada / Hindi / Tamil)"} />
                <Row k="Languages" v={langList(languages)} />
                <Row k="Notes" v={message} />
                <Row k="Attached" v={files.map((f) => f.filename).join(", ")} />
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
            <Fact k="Specialty" v={brief.highlights || "Not set yet"} />
            <Fact k="Occasion" v={brief.occasion || "Not set yet"} />
            <Fact k="Where" v={brief.region || "Not set yet"} />
            <Fact k="Dialect" v={codeSwitching ? "Kanglish / Hinglish" : "Pure Native"} />
            <Fact k="Files" v={files.length ? files.map((f) => f.filename).join(", ") : "None attached"} />
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
  const selected = (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  function toggle(o: string) {
    const isSel = selected.includes(o);
    const next = isSel ? selected.filter((s) => s !== o) : [...selected, o];
    onPick(next.join(", "));
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const isSel = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            className={`rounded-full px-2.5 py-1 text-xs transition-colors ${focusCls} ${
              isSel
                ? "bg-brand-600 font-semibold text-white shadow-sm ring-1 ring-brand-700"
                : idleCls
            }`}
          >
            {isSel ? `✓ ${o}` : `+ ${o}`}
          </button>
        );
      })}
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
      <div className="text-sm font-medium text-slate-700">Attach a file</div>
      <p className="text-xs text-slate-500">A logo, sample poster, photo, text note, voice recording, or any other file.</p>
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => add(e.target.files)} />
      <Button kind="ghost" small disabled={busy || files.length >= 8} onClick={() => input.current?.click()}>
        {busy ? "Attaching…" : "Attach file"}
      </Button>
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
