import { displayOffer } from "../lib/offer";
import { Campaign } from "../lib/types";

// The offer as an owner reads it: the headline figure, any condition, and the dates.

export function formatWhen(raw?: string | null) {
  if (!raw) return "";
  const iso = raw.length === 10 ? `${raw}T00:00:00+05:30` : raw;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return raw;
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" }).format(at);
}

export function offerParts(c: Campaign) {
  const offer = c.brain?.offer;
  const brief = c.brain?.brief;
  const typed = displayOffer(brief?.offer?.trim() || "");
  const figure = displayOffer(offer?.discount?.trim() || offer?.price?.trim() || typed);
  if (!figure) return null;
  let condition = "";
  if (typed && typed !== figure) condition = typed.replace(figure, "").replace(/^[\s,·\-–]+/, "").trim();
  else if (!typed) condition = offer?.duration_text?.trim() || "";
  const start = offer?.start_date || brief?.event_date;
  const end = offer?.end_date;
  const dates = start && end && start !== end ? `${formatWhen(start)} – ${formatWhen(end)}` : formatWhen(start);
  return { figure, condition, dates };
}

export function OfferStrip({ figure, condition, dates }: { figure: string; condition: string; dates: string }) {
  const percent = figure.match(/^(\d{1,3}(?:\.\d+)?)%$/);
  const conditionText = percent ? condition.replace(/^off\b[\s,·\-–]*/i, "").trim() : condition;
  return (
    <div className="lm-glass mt-5 inline-flex max-w-full flex-wrap items-center gap-x-8 gap-y-2 rounded-2xl px-5 py-3">
      <p className={percent ? "inline-flex items-baseline gap-2" : figure.length > 12 ? "font-display text-2xl text-slate-900" : "lm-gradient-text font-display text-5xl leading-none"}>
        {percent
          ? <><span className="lm-gradient-text font-display text-6xl leading-none">{percent[1]}%</span><span className="font-display text-2xl text-slate-700">off</span></>
          : figure}
      </p>
      {conditionText && <p className="text-sm font-medium text-slate-900">{conditionText}</p>}
      {dates && (
        <p className="text-sm text-slate-600">
          <span className="block text-xs">On</span>
          <span className="font-medium text-slate-900">{dates}</span>
        </p>
      )}
    </div>
  );
}
