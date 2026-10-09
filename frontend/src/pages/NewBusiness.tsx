import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api } from "../lib/api";
import { Button, Card, DocumentTitle, ErrorNote, Field, inputCls } from "../lib/ui";

export default function NewBusiness() {
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", category: "", city: "", address: "", lat: "", lng: "" });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/businesses", {
        name: form.name, category: form.category || null, city: form.city || null, address: form.address || null,
        lat: form.lat ? Number(form.lat) : null, lng: form.lng ? Number(form.lng) : null,
      });
      nav("/campaigns/new");
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-lg space-y-3">
      <DocumentTitle title="Add a business" />
      <h1 className="text-2xl font-bold">Add a business</h1>
      <p className="text-sm text-slate-600">This is the shop, clinic, or place a campaign is written for. It is separate from the organization on your account.</p>
      <Card className="space-y-3">
        <Field label="Name"><input className={inputCls} required value={form.name} onChange={set("name")} /></Field>
        <Field label="Category"><input className={inputCls} placeholder="Cafe, clinic, salon…" value={form.category} onChange={set("category")} /></Field>
        <Field label="City"><input className={inputCls} value={form.city} onChange={set("city")} /></Field>
        <Field label="Address"><input className={inputCls} value={form.address} onChange={set("address")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude (optional)"><input className={inputCls} value={form.lat} onChange={set("lat")} /></Field>
          <Field label="Longitude (optional)"><input className={inputCls} value={form.lng} onChange={set("lng")} /></Field>
        </div>
        <p className="text-xs text-slate-600">A location lets LocalMind mention real nearby places, such as colleges, offices, and transit, in the copy.</p>
      </Card>
      <ErrorNote error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save business"}</Button>
        <Link to="/" className="text-sm text-slate-600 underline">Back to campaigns</Link>
      </div>
    </form>
  );
}
