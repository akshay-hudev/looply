export interface Org {
  id: string;
  name: string;
  role: string;
}
export interface Me {
  id: string;
  email: string;
  name: string;
  organizations: Org[];
}

export interface Business {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  profile: Record<string, unknown>;
  learnings: Learning[];
}

export interface Offer {
  product: string | null;
  price: string | null;
  discount: string | null;
  duration_text: string | null;
  start_date: string | null;
  end_date: string | null;
  times: string | null;
  location: string | null;
  restrictions: string[];
}
export interface Locality {
  city: string | null;
  area: string | null;
  lat: number | null;
  lng: number | null;
  verified: boolean;
  data_source: string | null;
  signals: { type: string; count: number; examples: string[]; nearest_m: number | null }[];
  insights: { signal: string; interpretation: string; relevance: string }[];
  language_signals: { language: string; reason: string; rank?: number }[];
}
export interface Strategy {
  objective: string;
  primary_audience: string;
  secondary_audiences: string[];
  platforms: string[];
  formats: Record<string, string[]>;
  languages: string[];
  code_switching: boolean;
  code_switching_style: string;
  tone: string;
  posting_schedule: { platform: string; day: string; time: string; reason: string }[];
  rationale: string;
  accepted: boolean;
}
export interface OwnerFile {
  url: string;
  filename: string;
  kind: "image" | "text" | "audio" | "file";
  role: "logo" | "sample" | "note" | "voice" | "file";
  text?: string | null;
}
export interface Brief {
  product?: string;
  audience?: string;
  region?: string;
  goal?: string;
  offer?: string;
  occasion?: string;
  event_date?: string;
  tone?: string;
  highlights?: string;
}
export interface AudienceSegment {
  name: string;
  priority?: "primary" | "secondary";
  motivation?: string;
  tone?: string;
  platforms?: string[];
  languages?: string[];
  formats?: string[];
}
export interface CoreMessage {
  headline?: string;
  key_message?: string;
  value_props?: string[];
  must_include?: string[];
  cta_options?: string[];
}
export interface Brain {
  audiences?: AudienceSegment[];
  core_message?: CoreMessage | null;
  brief?: Brief;
  files?: OwnerFile[];
  requested_languages?: string[];
  content_mode: string;
  objective: string;
  clarifying_questions: string[];
  offer: Offer;
  locality: Locality;
  business: { name: string | null; brand_voice: string | null; supported_claims: string[] };
  strategy: Strategy;
  approval: { status: string; by: string | null; at: string | null };
  analytics_report?: AnalyticsReport | null;
}

export interface Asset {
  id: string;
  campaign_id?: string;
  platform: string;
  format: string;
  language: string;
  kind: string;
  variant: string;
  is_selected: boolean;
  status: string;
  content: Record<string, unknown> & {
    headline?: string;
    hook?: string;
    body?: string;
    cta?: string;
    hashtags?: string[];
    slides?: string[];
    slide_urls?: string[];
    overlay_text?: string;
    localization?: { score: number; back_translation: string };
    media_error?: string;
    media_source?: string;
    media_note?: string;
    image_prompt?: string;
    video_script?: { duration_s?: number; scenes?: { t?: string; visual?: string; overlay_text?: string }[] };
  };
  cultural_notes: string | null;
  media_url: string | null;
  media_status: string | null;
  verification: { status?: string; score?: number; verdict?: string; owner_accepted?: boolean; issues?: { code?: string; detail?: string; severity?: string; found?: string; expected?: string }[] };
  prediction: { label?: string; predicted_impact?: number; platform_fit?: number; local_relevance?: number; predicted_score?: number };
  attempts: number;
  brain_version: number;
}
export interface Summary {
  selected_assets: number;
  total_assets: number;
  languages: string[];
  platforms: string[];
  verified: number;
  failed: number;
  stale: number;
  truth: { avg_score?: number | null };
  predicted_impact: number | null;
  platform_fit: number | null;
  local_relevance: number | null;
  prediction_label: string;
}
export interface Campaign {
  id: string;
  business_id: string;
  title: string;
  status: string;
  stage: string | null;
  current_version: number;
  brain: Brain;
  assets?: Asset[];
  summary?: Summary;
  created_at: string;
  updated_at?: string;
  row?: CampaignListRow;
}

export interface CampaignListRow {
  poster_url: string | null;
  stale_count: number;
  published_at: string | null;
  next_at: string | null;
  platforms: { platform: string; state: string }[];
  failed_job_ids: string[];
}

export interface AgentEvent {
  seq: number;
  agent: string;
  status: string;
  message: string;
  data: Record<string, unknown>;
  created_at: string | null;
}
export interface SocialAccount {
  id: string;
  platform: string;
  display_name: string;
  business_id: string | null;
  active: boolean;
  target_platform: string;
  simulated: boolean;
  kind?: string | null;
}
export interface PublishJob {
  id: string;
  asset_id: string;
  platform: string;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  external_post_id: string | null;
  error: string | null;
  attempts: number;
  result: { url?: string; simulated?: boolean; sent?: number; failed?: number };
  simulated: boolean;
}
export interface Contact {
  id: string;
  phone: string;
  name: string;
  language: string | null;
  opted_in: boolean;
  opt_in_source: string;
}
export interface Learning {
  id?: string;
  insight: string;
  evidence: string;
  recommendation: string;
  campaign_id?: string;
  simulated?: boolean;
  at?: string;
}
export interface AnalyticsRow {
  asset_id: string;
  platform: string;
  format: string;
  language: string;
  metrics: Record<string, number | boolean | null>;
  simulated: boolean;
  ai_predicted: { predicted_impact?: number; platform_fit?: number; local_relevance?: number };
}
export interface AnalyticsReport {
  summary: string;
  learnings: Learning[];
  prediction_accuracy: string;
}

export const LANGUAGES: Record<string, string> = {
  en: "English",
  kn: "Kannada (ಕನ್ನಡ)",
  kn_en: "Kanglish (Kannada + English)",
  hi: "Hindi (हिंदी)",
  hi_en: "Hinglish (Hindi + English)",
  ta: "Tamil (தமிழ்)",
  ta_en: "Tanglish (Tamil + English)",
  te: "Telugu (తెలుగు)",
  mr: "Marathi (मराठी)",
  bn: "Bengali (বাংলা)",
  ml: "Malayalam (മലയാളം)",
  gu: "Gujarati (ગુજરાતી)",
  pa: "Punjabi (ਪੰਜਾਬੀ)",
  ur: "Urdu (اردو)",
  es: "Spanish",
  fr: "French",
  ar: "Arabic",
  pt: "Portuguese",
  id: "Indonesian",
};
export const PLATFORMS = ["instagram", "whatsapp", "facebook", "linkedin", "youtube", "x"] as const;
export const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram", whatsapp: "WhatsApp", facebook: "Facebook", linkedin: "LinkedIn", youtube: "YouTube", x: "X",
};
