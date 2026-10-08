import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { api } from "../lib/api";
import { Campaign } from "../lib/types";
import { Badge, Button, Card, statusTone } from "../lib/ui";

export default function Dashboard() {
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: () => api.get<Campaign[]>("/campaigns") });
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <Link to="/campaigns/new"><Button>New campaign</Button></Link>
      </div>
      <div className="grid gap-3">
        {(campaigns.data ?? []).map((c) => (
          <Link key={c.id} to={`/campaigns/${c.id}`}>
            <Card className="flex items-center justify-between hover:border-brand-500">
              <div>
                <div className="font-medium">{c.title}</div>
                <div className="text-xs text-slate-500">{new Date(c.created_at).toLocaleString()}</div>
              </div>
              <Badge tone={statusTone(c.status)}>{c.status.replace("_", " ")}</Badge>
            </Card>
          </Link>
        ))}
        {campaigns.data?.length === 0 && <p className="text-sm text-slate-500">No campaigns yet. Create your first one.</p>}
      </div>
    </div>
  );
}
