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
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 shadow-md">
          <svg className="h-8 w-8" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="authLoop" x1="8" y1="16" x2="56" y2="48" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#ea580c"/>
                <stop offset="45%" stopColor="#f97316"/>
                <stop offset="75%" stopColor="#ec4899"/>
                <stop offset="100%" stopColor="#06b6d4"/>
              </linearGradient>
            </defs>
            <path d="M22 23 C14 23 8 27.5 8 32 C8 36.5 14 41 22 41 C30 41 34 32 42 32 C50 32 56 35 56 32 C56 29 50 23 42 23 C34 23 30 32 22 32" stroke="url(#authLoop)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">LOOPLY</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">Your Intent, Amplified</p>
      </div>
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
