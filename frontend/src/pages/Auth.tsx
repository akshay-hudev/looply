import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, auth } from "../lib/api";
import { Me } from "../lib/types";
import { ThemeToggle } from "../lib/theme";
import { Button, Card, DocumentTitle, ErrorNote, Field, idleCls, inputCls, selectedCls } from "../lib/ui";

const MODES = [
  { id: "register", label: "Create account" },
  { id: "login", label: "Log in" },
] as const;

function friendlyAuthError(err: unknown, mode: "login" | "register"): unknown {
  const msg = err instanceof Error ? err.message : "";
  if (mode === "login" && /invalid email or password/i.test(msg)) return new Error("Email or password doesn't match.");
  if (/already registered/i.test(msg)) return new Error("That email is already registered.");
  return err;
}

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
      nav(mode === "register" ? "/businesses/new" : "/");
    } catch (err) {
      setError(friendlyAuthError(err, mode));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto mt-16 max-w-md">
      <DocumentTitle title={mode === "register" ? "Create account" : "Log in"} />
      <div className="mb-4 flex justify-end"><ThemeToggle /></div>
      <h1 className="mb-1 text-center text-3xl font-bold text-brand-700">Looply</h1>
      <p className="mb-6 text-center text-sm text-slate-600">AI marketing campaigns in your customers' language.</p>
      <Card>
        <div className="mb-4 flex gap-2 text-sm">
          {MODES.map((m) => (
            <button key={m.id} type="button" onClick={() => setMode(m.id)}
              className={`flex-1 rounded-lg py-2 ${mode === m.id ? selectedCls : idleCls}`}>
              {m.label}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Email"><input className={inputCls} type="email" required value={form.email} onChange={set("email")} /></Field>
          {mode === "register" && <>
            <Field label="Your name"><input className={inputCls} required value={form.name} onChange={set("name")} /></Field>
            <Field label="Organization">
              <input className={inputCls} required value={form.organization_name} onChange={set("organization_name")} />
            </Field>
            <p className="-mt-2 text-xs text-slate-600">This is your workspace. You'll add the shop, clinic, or other business on the next step.</p>
          </>}
          <Field label="Password">
            <input className={inputCls} type="password" required minLength={8} value={form.password} onChange={set("password")} />
          </Field>
          <p className="-mt-2 text-xs text-slate-600">At least 8 characters.</p>
          <ErrorNote error={error} />
          <Button type="submit" disabled={busy}>
            {busy ? (mode === "register" ? "Creating your account…" : "Checking…") : mode === "register" ? "Create account" : "Log in"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
