import { motion, useReducedMotion } from "framer-motion";
import { FormEvent, ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";

import { LoginShowcase, LoopMark } from "../components/LoginShowcase";
import { api, auth } from "../lib/api";
import { Me } from "../lib/types";
import { DocumentTitle, ErrorNote } from "../lib/ui";

// A light, warm page regardless of the app theme (layout after motionsites "Aurora Onboard"): the
// product story on the left, a quiet form on the right. Colours are explicit so the app's dark-mode
// overrides don't reach in.

const MODES = [
  { id: "login", label: "Log in" },
  { id: "register", label: "Create account" },
] as const;

const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2410c]";

function friendlyAuthError(err: unknown, mode: "login" | "register"): unknown {
  const msg = err instanceof Error ? err.message : "";
  if (mode === "login" && /invalid email or password/i.test(msg)) return new Error("Email or password doesn't match.");
  if (/already registered/i.test(msg)) return new Error("That email is already registered.");
  return err;
}

/** 0–4 from length, mixed case, digits and symbols. */
function strength(pw: string) {
  if (!pw) return 0;
  let s = pw.length >= 8 ? 1 : 0;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (pw.length >= 12 && s >= 3) s = 4;
  return Math.min(s, 4);
}
const STRENGTH = [
  { label: "Too short", color: "#ef4444" }, { label: "Weak", color: "#f97316" }, { label: "Okay", color: "#eab308" },
  { label: "Strong", color: "#22c55e" }, { label: "Very strong", color: "#10b981" },
];

function Field({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-[#57534e]">{label}</span>
      <span className="flex h-12 items-center gap-2.5 rounded-xl bg-[#ffffff] px-3.5 shadow-sm ring-1 ring-[#e7d8c6] transition focus-within:ring-2 focus-within:ring-[#ea580c]">
        <span aria-hidden="true" className="text-[#a8a29e]">{icon}</span>
        {children}
      </span>
    </label>
  );
}
const inputCls = "h-full min-w-0 flex-1 bg-transparent text-sm text-[#1c1917] outline-none placeholder:text-[#a8a29e]";

const icons = {
  mail: <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2.5" y="4.5" width="15" height="11" rx="2" /><path d="M3 5.5l7 5 7-5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  user: <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10" cy="7" r="3" /><path d="M4 16.5c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5" strokeLinecap="round" /></svg>,
  org: <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3.5 16.5V7l6.5-3.5L16.5 7v9.5M7.5 16.5v-4h5v4M2.5 16.5h15" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  lock: <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4" y="9" width="12" height="8" rx="2" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></svg>,
};

export default function AuthPage() {
  const nav = useNavigate();
  const reduce = Boolean(useReducedMotion());
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ email: "", name: "", password: "", organization_name: "" });
  const [show, setShow] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const score = strength(form.password);

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
    <main className="lm-page min-h-screen p-2 text-[#1c1917] lg:h-screen lg:overflow-hidden lg:p-4" style={{ backgroundColor: "#fff8ef" }}>
      <DocumentTitle title={mode === "register" ? "Create account" : "Log in"} />
      <div className="grid h-full gap-4 lg:grid-cols-[52%_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <LoginShowcase />
        </div>

        <div className="relative flex flex-col px-4 py-8 sm:px-10">
          <div className="flex items-center lg:hidden">
            <span className="flex items-center gap-2"><LoopMark className="h-8 w-8" /><span className="font-display text-xl">LOOPLY</span></span>
          </div>

          <motion.div className="m-auto w-full max-w-md py-10"
            initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: "easeOut" }}>
            <h1 className="font-display text-5xl leading-[1.05]">{mode === "register" ? "Start your loop" : "Welcome back"}</h1>
            <p className="mt-2 text-sm text-[#57534e]">{mode === "register" ? "Two minutes to your first campaign." : "Your campaigns are waiting."}</p>

            <div role="tablist" aria-label="Log in or create an account" className="mt-7 grid grid-cols-2 rounded-2xl bg-[#ffffff] p-1 shadow-sm ring-1 ring-[#f1e3d1]">
              {MODES.map((m) => {
                const on = mode === m.id;
                return (
                  <button key={m.id} type="button" role="tab" aria-selected={on} onClick={() => { setMode(m.id); setError(null); }}
                    className={`relative rounded-xl py-2.5 text-sm font-semibold transition-colors ${ring} ${on ? "text-[#ffffff]" : "text-[#78716c] hover:text-[#1c1917]"}`}>
                    {on && <motion.span layoutId="auth-pill" className="absolute inset-0 rounded-xl" style={{ backgroundImage: "linear-gradient(100deg,#c2410c,#be185d)" }}
                      transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.2, duration: 0.45 }} />}
                    <span className="relative">{m.label}</span>
                  </button>
                );
              })}
            </div>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <Field icon={icons.mail} label="Email">
                <input className={inputCls} type="email" required autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@shop.in" />
              </Field>
              {mode === "register" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field icon={icons.user} label="Your name">
                    <input className={inputCls} required autoComplete="name" value={form.name} onChange={set("name")} placeholder="Ravi" />
                  </Field>
                  <Field icon={icons.org} label="Workspace">
                    <input className={inputCls} required autoComplete="organization" value={form.organization_name} onChange={set("organization_name")} placeholder="Ravi Foods" />
                  </Field>
                </div>
              )}
              <div>
                <Field icon={icons.lock} label="Password">
                  <input className={inputCls} type={show ? "text" : "password"} required minLength={8}
                    autoComplete={mode === "register" ? "new-password" : "current-password"} value={form.password} onChange={set("password")} placeholder="At least 8 characters" />
                  <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
                    className={`rounded-lg p-1 text-[#a8a29e] hover:text-[#1c1917] ${ring}`}>
                    {show
                      ? <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 3l14 14M8.2 8.3a2.5 2.5 0 0 0 3.5 3.5M6 5.6C3.9 6.8 2.5 9 2.5 10c0 1.5 3.4 5.5 7.5 5.5 1.4 0 2.7-.4 3.8-1.1M10 4.5c4.1 0 7.5 4 7.5 5.5 0 .7-.6 1.9-1.6 3" strokeLinecap="round" /></svg>
                      : <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2.5 10c0-1.5 3.4-5.5 7.5-5.5s7.5 4 7.5 5.5-3.4 5.5-7.5 5.5S2.5 11.5 2.5 10z" /><circle cx="10" cy="10" r="2.5" /></svg>}
                  </button>
                </Field>
                {mode === "register" && form.password && (
                  <div className="mt-2" aria-live="polite">
                    <div className="flex gap-1" aria-hidden="true">
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className="h-1.5 flex-1 rounded-full transition-colors duration-300"
                          style={{ backgroundColor: i < Math.max(score, 1) ? STRENGTH[score].color : "#f1e3d1" }} />
                      ))}
                    </div>
                    <p className="mt-1 text-xs" style={{ color: STRENGTH[score].color }}>{STRENGTH[score].label}</p>
                  </div>
                )}
              </div>
              <ErrorNote error={error} />
              <button type="submit" disabled={busy}
                className={`lm-cta flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-[#ffffff] transition active:scale-[0.98] disabled:opacity-70 motion-reduce:active:scale-100 ${ring}`}>
                {busy ? (mode === "register" ? "Creating your account…" : "Checking…") : mode === "register" ? "Create account" : "Log in"}
                {!busy && <span aria-hidden="true">→</span>}
              </button>
            </form>
            <p className="mt-6 text-center text-xs text-[#78716c]">
              {mode === "register" ? "Next, you'll add the shop you're promoting." : "New here? "}
              {mode === "login" && (
                <button type="button" onClick={() => setMode("register")} className={`font-semibold text-[#c2410c] hover:underline ${ring}`}>Create an account</button>
              )}
            </p>
          </motion.div>
        </div>
      </div>
    </main>
  );
}
