import { motion, useReducedMotion } from "framer-motion";
import { ReactNode } from "react";

import { Asset, PLATFORM_LABELS } from "../lib/types";
import { focusCls } from "../lib/ui";
import { Img } from "./fx";

// Shows a creative the way a customer meets it: an Instagram post, a story, a WhatsApp message
// from the shop. The platform chrome is a hint, not a pixel copy of any app.

const LOOP_GRADIENT = "linear-gradient(135deg, #ea580c 0%, #f97316 40%, #ec4899 75%, #06b6d4 100%)";
const TALL = new Set(["story", "reel", "short"]);

function handleOf(shopName: string) {
  const slug = shopName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return slug || "yourshop";
}

function Avatar({ shopName, size = "h-8 w-8", ring = false }: { shopName: string; size?: string; ring?: boolean }) {
  const letter = [...shopName.trim()][0]?.toUpperCase() ?? "L";
  return (
    <span className={`${ring ? "p-[2px]" : ""} inline-flex shrink-0 rounded-full`} style={ring ? { backgroundImage: LOOP_GRADIENT } : undefined}>
      <span className={`${size} flex items-center justify-center rounded-full text-sm font-semibold text-white`} style={{ backgroundImage: LOOP_GRADIENT }}>
        {letter}
      </span>
    </span>
  );
}

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
const HEART = "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z";
const COMMENT = "M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z";
const SEND = "M21 3 10 14M21 3l-7 18-4-7-7-4 18-7z";
const SAVE = "M6 3h12v18l-6-4-6 4z";
const SHARE = "M4 12v7h16v-7M12 3v12M7 8l5-5 5 5";

function Media({ src, alt, onZoom, fallback, className }: { src?: string | null; alt: string; onZoom: () => void; fallback: ReactNode; className: string }) {
  if (!src) return <div className={className}>{fallback}</div>;
  return (
    <button type="button" onClick={onZoom} className={`block w-full overflow-hidden ${focusCls} ${className}`} aria-label={`Enlarge ${alt}`}>
      {/* Fit, never crop: a cropped poster can cut "25% off" down to "5% of". */}
      <Img src={src} alt={alt} className="h-full w-full object-contain" fallback={fallback} />
    </button>
  );
}

function TextCard({ headline, note }: { headline: string; note: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-5 text-center text-white" style={{ backgroundImage: LOOP_GRADIENT }}>
      <p className="text-lg font-bold leading-tight">{headline}</p>
      <p className="text-[11px] opacity-90">{note}</p>
    </div>
  );
}

function Caption({ handle, body, hashtags }: { handle: string; body: string; hashtags: string[] }) {
  if (!body && !hashtags.length) return null;
  return (
    <p className="line-clamp-3 whitespace-pre-line text-xs text-slate-700">
      <b className="text-slate-900">{handle}</b> {body}
      {hashtags.length > 0 && <span className="text-sky-700 dark:text-sky-300"> {hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</span>}
    </p>
  );
}

function CtaBar({ cta }: { cta?: string }) {
  if (!cta) return null;
  return (
    <div className="flex items-center justify-between border-y border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900">
      <span className="truncate">{cta}</span>
      <Icon d="M9 6l6 6-6 6" className="h-4 w-4" />
    </div>
  );
}

function FeedPost({ asset, shopName, src, onZoom, fallback, platform }: PreviewProps & { platform: string }) {
  const c = asset.content;
  const handle = handleOf(shopName);
  const body = String(c.body ?? "");
  const hashtags = c.hashtags ?? [];
  const alt = `${PLATFORM_LABELS[platform] ?? platform} post by ${shopName}`;
  const media = <Media src={src} alt={alt} onZoom={onZoom} fallback={fallback} className="aspect-square bg-slate-100" />;

  if (platform === "instagram") {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-3 py-2">
          <Avatar shopName={shopName} size="h-7 w-7" ring />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-xs font-semibold text-slate-900">{handle}</p>
            <p className="text-[10px] text-slate-500">Sponsored</p>
          </div>
          <span className="ml-auto text-slate-500">•••</span>
        </div>
        {media}
        <CtaBar cta={c.cta} />
        <div className="space-y-1.5 px-3 py-2">
          <div className="flex items-center gap-3 text-slate-900">
            <Icon d={HEART} /><Icon d={COMMENT} /><Icon d={SEND} /><span className="ml-auto"><Icon d={SAVE} /></span>
          </div>
          <Caption handle={handle} body={body} hashtags={hashtags} />
        </div>
      </div>
    );
  }

  if (platform === "x") {
    return (
      <div className="flex gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <Avatar shopName={shopName} />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="truncate text-xs"><b className="text-slate-900">{shopName}</b> <span className="text-slate-500">@{handle} · Ad</span></p>
          <p className="line-clamp-4 whitespace-pre-line text-xs text-slate-900">{body || c.headline}</p>
          <div className="overflow-hidden rounded-2xl border border-slate-200">{media}</div>
          <div className="flex justify-between pr-6 text-slate-500"><Icon d={COMMENT} className="h-4 w-4" /><Icon d={SHARE} className="h-4 w-4" /><Icon d={HEART} className="h-4 w-4" /></div>
        </div>
      </div>
    );
  }

  // Facebook and LinkedIn share a shape: text above the picture, a link bar, then reactions.
  const tag = platform === "linkedin" ? "Promoted" : "Sponsored";
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-3 pt-3">
        <Avatar shopName={shopName} size={platform === "linkedin" ? "h-9 w-9 rounded-md" : "h-9 w-9"} />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-xs font-semibold text-slate-900">{shopName}</p>
          <p className="text-[10px] text-slate-500">{tag}</p>
        </div>
      </div>
      {body && <div className="px-3 py-2"><p className="line-clamp-3 whitespace-pre-line text-xs text-slate-900">{body}</p></div>}
      {media}
      {(c.headline || c.cta) && (
        <div className="flex items-center gap-2 bg-slate-100 px-3 py-2">
          <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900">{c.headline}</p>
          {c.cta && <span className="shrink-0 rounded-md bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-900">{c.cta}</span>}
        </div>
      )}
      <div className="flex justify-around border-t border-slate-200 py-1.5 text-[11px] text-slate-600">
        <span className="flex items-center gap-1"><Icon d={HEART} className="h-4 w-4" />Like</span>
        <span className="flex items-center gap-1"><Icon d={COMMENT} className="h-4 w-4" />Comment</span>
        <span className="flex items-center gap-1"><Icon d={SHARE} className="h-4 w-4" />{platform === "linkedin" ? "Repost" : "Share"}</span>
      </div>
    </div>
  );
}

function TallPost({ asset, shopName, src, onZoom, fallback }: PreviewProps) {
  const c = asset.content;
  const alt = `${PLATFORM_LABELS[asset.platform] ?? asset.platform} ${asset.format} by ${shopName}`;
  return (
    <div className="relative mx-auto aspect-[9/16] h-96 overflow-hidden rounded-[1.5rem] border-[5px] border-slate-900 bg-slate-900 shadow-md dark:border-[#262626]">
      <Media src={src} alt={alt} onZoom={onZoom} fallback={fallback} className="h-full bg-[#000000]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 space-y-2 bg-gradient-to-b from-black/50 to-transparent p-2.5">
        {asset.format === "story" && (
          <div className="flex gap-1"><span className="h-0.5 flex-1 rounded-full bg-white" /><span className="h-0.5 flex-1 rounded-full bg-white/40" /></div>
        )}
        <div className="flex items-center gap-1.5">
          <Avatar shopName={shopName} size="h-6 w-6" />
          <span className="truncate text-[11px] font-semibold text-white">{handleOf(shopName)}</span>
          <span className="text-[10px] text-white/80">Sponsored</span>
        </div>
      </div>
      {c.cta && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/50 to-transparent p-3">
          <span className="max-w-full truncate rounded-full bg-[#ffffff] px-3 py-1 text-[11px] font-semibold text-[#0f172a]">{c.cta}</span>
        </div>
      )}
    </div>
  );
}

function ChatPost({ asset, shopName, src, onZoom }: PreviewProps) {
  const c = asset.content;
  const body = String(c.body ?? c.headline ?? "");
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="flex items-center gap-2 bg-[#008069] px-3 py-2 text-[#ffffff] dark:bg-[#202c33]">
        <Avatar shopName={shopName} size="h-7 w-7" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-xs font-semibold">{shopName}</p>
          <p className="text-[10px] opacity-80">Business account</p>
        </div>
      </div>
      <div className="space-y-1 bg-[#efeae2] p-3 dark:bg-[#0b141a]">
        <div className="max-w-[88%] rounded-lg rounded-tl-none bg-[#ffffff] p-1 shadow-sm dark:bg-[#202c33]">
          {src && (
            <button type="button" onClick={onZoom} className={`block w-full overflow-hidden rounded-md ${focusCls}`} aria-label={`Enlarge WhatsApp picture from ${shopName}`}>
              <Img src={src} alt={`WhatsApp picture from ${shopName}`} className="max-h-48 w-full object-contain" fallback={null} />
            </button>
          )}
          <p className="whitespace-pre-wrap px-1.5 pt-1 text-xs text-[#111b21] dark:text-[#e9edef]">{body}</p>
          <p className="px-1.5 text-right text-[10px] text-[#667781] dark:text-[#8696a0]">10:24</p>
        </div>
        {c.cta && (
          <div className="max-w-[88%] rounded-lg bg-[#ffffff] py-1.5 text-center text-xs font-medium text-[#027eb5] shadow-sm dark:bg-[#202c33] dark:text-[#53bdeb]">
            {c.cta}
          </div>
        )}
      </div>
    </div>
  );
}

type PreviewProps = {
  asset: Asset;
  shopName: string;
  src?: string | null;
  onZoom: () => void;
  fallback: ReactNode;
};

export function PostPreview({ asset, shopName, src, onZoom, emptyNote }: {
  asset: Asset;
  shopName: string;
  src?: string | null;
  onZoom: () => void;
  emptyNote: string;
}) {
  const reduce = Boolean(useReducedMotion());
  const headline = asset.content.headline || asset.content.hook || String(asset.content.body ?? "").split("\n")[0] || shopName;
  const props: PreviewProps = { asset, shopName, src, onZoom, fallback: <TextCard headline={headline} note={emptyNote} /> };
  const body = asset.platform === "whatsapp"
    ? <ChatPost {...props} />
    : TALL.has(asset.format)
      ? <TallPost {...props} />
      : <FeedPost {...props} platform={asset.platform} />;
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      {body}
    </motion.div>
  );
}
