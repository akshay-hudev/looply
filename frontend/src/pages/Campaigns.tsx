import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { api } from "../lib/api";
import { Brief, Business, Campaign, LANGUAGES, Offer } from "../lib/types";
import { Badge, Button, Card, DocumentTitle, ErrorNote, focusCls, statusLabel, statusTone } from "../lib/ui";

function offerLine(brief?: Brief, offer?: Offer): string {
  const typed = brief?.offer?.trim();
  if (typed) return typed;
  const parts = [offer?.discount, offer?.price].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return "No price or deal. We won't invent one.";
}
function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function languagesOf(c: Campaign) {
  return c.brain?.strategy?.languages?.length
    ? c.brain.strategy.languages
    : c.brain?.requested_languages ?? [];
}

const primaryLink = `inline-flex items-center rounded-lg bg-brand-700 px-4 py-2 font-medium text-white hover:bg-brand-800 ${focusCls}`;

export default function Campaigns() {
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: () => api.get<Campaign[]>("/campaigns") });
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => api.get<Business[]>("/businesses") });
  const rows = campaigns.data ?? [];
  const shops = businesses.data ?? [];
  const names = new Map(shops.map((b) => [b.id, b]));

  if (campaigns.isLoading || businesses.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <DocumentTitle title="Campaigns" />
        <p className="sr-only">Loading campaigns</p>
        <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200 motion-reduce:animate-none" />
        <div className="h-20 animate-pulse rounded-xl bg-slate-200 motion-reduce:animate-none" />
      </div>
    );
  }
  if (campaigns.isError || businesses.isError) {
    return (
      <div className="space-y-2">
        <DocumentTitle title="Campaigns" />
        <ErrorNote error={new Error("Couldn't load this. Try again.")} />
        <Button onClick={() => { campaigns.refetch(); businesses.refetch(); }}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DocumentTitle title="Campaigns" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        {shops.length === 0
          ? <Link className={primaryLink} to="/businesses/new">Add a business</Link>
          : <Link className={primaryLink} to="/campaigns/new">New campaign</Link>}
      </div>
      {rows.length === 0 && (
        <p className="text-sm text-slate-600">
          {shops.length === 0
            ? "Add your business first. Then describe one promotion and LocalMind drafts it in your customers' language."
            : "No campaigns yet. Describe one promotion and LocalMind drafts it in your customers' language."}
        </p>
      )}
      <div className="grid gap-3">
        {rows.map((c) => (
          <Link key={c.id} to={`/campaigns/${c.id}`}>
            <Card className="flex items-center justify-between gap-3 hover:border-brand-500">
              <div>
                <div className="font-medium">{c.title}</div>
                <div className="text-xs text-slate-600">
                  {[names.get(c.business_id)?.name, offerLine(c.brain?.brief, c.brain?.offer)].filter(Boolean).join(" · ")}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(c.brain?.strategy?.platforms ?? []).map((p) => <Badge key={p}>{cap(p)}</Badge>)}
                  {languagesOf(c).map((l) => <Badge key={l}>{LANGUAGES[l] ?? l}</Badge>)}
                </div>
              </div>
              <Badge tone={statusTone(c.status)}>{statusLabel(c.status)}</Badge>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
