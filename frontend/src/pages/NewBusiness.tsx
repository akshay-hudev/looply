import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { InfoTip } from "../components/CampaignParts";
import { LOOP_GRADIENT } from "../components/fx";
import { api } from "../lib/api";
import { Button, DocumentTitle, ErrorNote, focusCls, inputCls } from "../lib/ui";

const CATEGORIES = [
  { label: "Cafe", icon: "☕" }, { label: "Restaurant", icon: "🍽️" }, { label: "Bakery", icon: "🧁" },
  { label: "Fashion", icon: "👗" }, { label: "Jewellery", icon: "💍" }, { label: "Salon", icon: "💇" },
  { label: "Gym", icon: "🏋️" }, { label: "Clinic", icon: "🩺" }, { label: "Store", icon: "🛒" },
];

export default function NewBusiness() {
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", category: "", city: "", address: "", lat: "", lng: "" });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const picked = CATEGORIES.find((c) => c.label.toLowerCase() === form.category.trim().toLowerCase());

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
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-6">
      <DocumentTitle title="Add a business" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">New business</p>
        <h1 className="font-display text-5xl leading-none text-slate-900">Add a business</h1>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <section className="lm-card space-y-6 rounded-3xl border bg-white p-5 sm:p-6">
          <label className="block">
            <span className="text-sm font-semibold text-slate-900">🏪 Name</span>
            <input className={`${inputCls} mt-1.5 py-3 text-base`} required value={form.name} onChange={set("name")} placeholder="e.g. AVIS Cafe" />
          </label>

          <div className="space-y-2">
            <span className="text-sm font-semibold text-slate-900">🏷️ What kind of place?</span>
            <div role="group" aria-label="Category" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {CATEGORIES.map((c) => {
                const on = picked?.label === c.label;
                return (
                  <button key={c.label} type="button" aria-pressed={on} onClick={() => setForm({ ...form, category: on ? "" : c.label })}
                    className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 text-sm transition duration-200 motion-reduce:transition-none ${focusCls} ${
                      on ? "border-brand-600 bg-brand-50 font-semibold text-slate-900" : "border-[#f1e3d1] bg-white text-slate-700 hover:-translate-y-0.5 hover:border-brand-300 dark:border-[#292524]"}`}>
                    <span aria-hidden="true" className="text-2xl">{c.icon}</span>{c.label}
                  </button>
                );
              })}
            </div>
            <input aria-label="Category" className={inputCls} placeholder="Or type your own" value={picked ? "" : form.category} onChange={set("category")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-slate-900">🏙️ City</span>
              <input className={`${inputCls} mt-1.5`} value={form.city} onChange={set("city")} placeholder="e.g. Bengaluru" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-900">📍 Address</span>
              <input className={`${inputCls} mt-1.5`} value={form.address} onChange={set("address")} placeholder="e.g. 3rd Cross, Indiranagar" />
            </label>
          </div>

          <details className="rounded-2xl bg-[#fdf1e4] px-4 py-3 dark:bg-[#1c1917]">
            <summary className={`flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm font-semibold text-slate-700 ${focusCls}`}>
              🧭 Exact location (optional)
              <InfoTip label="Why it helps">A location lets LOOPLY mention real nearby places, such as colleges, offices and transit, in the copy.</InfoTip>
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block text-xs text-slate-600">Latitude<input className={`${inputCls} mt-1`} value={form.lat} onChange={set("lat")} placeholder="12.97" /></label>
              <label className="block text-xs text-slate-600">Longitude<input className={`${inputCls} mt-1`} value={form.lng} onChange={set("lng")} placeholder="77.64" /></label>
            </div>
          </details>
        </section>

        <aside aria-label="Preview" className="lm-card space-y-3 rounded-3xl border bg-white p-4 lg:sticky lg:top-24">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">How it will look</p>
          <div className="flex items-center gap-3 rounded-2xl border-2 border-brand-600 bg-brand-50 p-3">
            <span aria-hidden="true" className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-display text-2xl text-[#ffffff]" style={{ backgroundImage: LOOP_GRADIENT }}>
              {[...form.name.trim()][0]?.toUpperCase() || "?"}
              <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm shadow">{picked?.icon ?? "🏪"}</span>
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold text-slate-900">{form.name || "Your business"}</span>
              <span className="block truncate text-xs text-slate-500">{[form.category, form.city].filter(Boolean).join(" · ") || "Category · City"}</span>
            </span>
          </div>
          <ul className="space-y-1.5 text-xs text-slate-600">
            {[["Name", form.name], ["Kind", form.category], ["City", form.city], ["Address", form.address]].map(([k, v]) => (
              <li key={k} className="flex items-center gap-2">
                <span aria-hidden="true" className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${v ? "bg-emerald-600 text-white" : "bg-[#f1e3d1] dark:bg-[#292524]"}`}>{v ? "✓" : ""}</span>{k}
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <ErrorNote error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save business →"}</Button>
        <Link to="/campaigns" className={`text-sm text-slate-600 underline ${focusCls}`}>Back to campaigns</Link>
      </div>
    </form>
  );
}
