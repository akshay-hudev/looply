import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { api } from "../lib/api";
import { Business, Campaign } from "../lib/types";
import { Badge, Button, Card, DocumentTitle, ErrorNote, Spinner, statusLabel, statusTone } from "../lib/ui";

export default function Dashboard() {
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: () => api.get<Campaign[]>("/campaigns") });
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => api.get<Business[]>("/businesses") });
  const names = new Map((businesses.data ?? []).map((b) => [b.id, b.name]));
  const noBusiness = businesses.isSuccess && businesses.data.length === 0;

  return (
    <div>
      <DocumentTitle title="Campaigns" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        {businesses.isLoading ? null : noBusiness
          ? <Link to="/businesses/new"><Button>Add a business</Button></Link>
          : <Link to="/campaigns/new"><Button>New campaign</Button></Link>}
      </div>
      <div className="grid gap-3">
        {campaigns.isLoading && (
          <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><Spinner /> Loading campaigns</p>
        )}
        {campaigns.isError && (
          <div className="space-y-2">
            <ErrorNote error={new Error("Couldn't load this. Try again.")} />
            <Button onClick={() => campaigns.refetch()}>Try again</Button>
          </div>
        )}
        {(campaigns.data ?? []).map((c) => (
          <Link key={c.id} to={`/campaigns/${c.id}`}>
            <Card className="flex items-center justify-between gap-3 hover:border-brand-500">
              <div>
                <div className="font-medium">{c.title}</div>
                <div className="text-xs text-slate-600">
                  {[names.get(c.business_id), new Date(c.created_at).toLocaleString()].filter(Boolean).join(" · ")}
                </div>
              </div>
              <Badge tone={statusTone(c.status)}>{statusLabel(c.status)}</Badge>
            </Card>
          </Link>
        ))}
        {campaigns.data?.length === 0 && (
          <p className="text-sm text-slate-600">
            {noBusiness
              ? "Add your business first. Then describe one promotion and LocalMind drafts it in your customers' language."
              : "No campaigns yet. Describe one promotion and LocalMind drafts it in your customers' language."}
          </p>
        )}
      </div>
    </div>
  );
}
