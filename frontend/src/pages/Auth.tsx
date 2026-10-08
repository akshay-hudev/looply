import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, auth } from "../lib/api";
import { Me } from "../lib/types";
import { Button, Card, ErrorNote, Field, inputCls } from "../lib/ui";

export default function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [form, setForm] = useState({ email: "", name: "", password: "", organization_name: "" });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = mode === "register" ? form : { email: form.email, password: form.password };
      const res = await api.post<{ access_token: string; user: Me }>(`/auth/${mode}`, body);
      auth.set(res.access_token, res.user.organizations[0].id);
      nav("/");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-md">
      <h1 className="mb-1 text-center text-3xl font-bold text-brand-700">LocalMind</h1>
      <p className="mb-6 text-center text-sm text-slate-500">AI marketing campaigns in your customers' language.</p>
      <Card>
        <div className="mb-4 flex gap-2 text-sm">
          {(["register", "login"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 rounded-lg py-1.5 capitalize ${mode === m ? "bg-brand-600 text-white" : "bg-slate-100"}`}>
              {m}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Email"><input className={inputCls} type="email" required value={form.email} onChange={set("email")} /></Field>
          {mode === "register" && <>
            <Field label="Your name"><input className={inputCls} required value={form.name} onChange={set("name")} /></Field>
            <Field label="Business / organization"><input className={inputCls} required value={form.organization_name} onChange={set("organization_name")} /></Field>
          </>}
          <Field label="Password"><input className={inputCls} type="password" required minLength={8} value={form.password} onChange={set("password")} /></Field>
          <ErrorNote error={error} />
          <Button type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create account" : "Log in"}</Button>
        </form>
      </Card>
    </div>
  );
}
