import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api } from "../lib/api";
import { Business, Contact, PLATFORMS, SocialAccount } from "../lib/types";
import { Badge, Button, Card, DocumentTitle, ErrorNote, Field, focusCls, inputCls, Stepper } from "../lib/ui";

type Platform = (typeof PLATFORMS)[number];
type Method = "login" | "token" | "simulated";
type Providers = Record<Platform, { login: boolean; via: string }>;

const OFFICIAL_LOGIN_URLS: Record<Platform, string> = {
  instagram: "https://www.instagram.com/accounts/login/",
  facebook: "https://www.facebook.com/login.php",
  whatsapp: "https://web.whatsapp.com/",
  linkedin: "https://www.linkedin.com/login",
};

const META: Record<Platform, { label: string; icon: string; color: string; needs: string; idLabel: string; idHelp: string }> = {
  instagram: {
    label: "Instagram", icon: "📸", color: "from-pink-500 to-orange-400",
    needs: "An Instagram Professional account (Business or Creator).",
    idLabel: "Instagram business account id", idHelp: "Meta Business Suite → Settings → Instagram accounts.",
  },
  facebook: {
    label: "Facebook Page", icon: "📘", color: "from-blue-600 to-blue-400",
    needs: "A Facebook Page you manage.", idLabel: "Facebook Page id", idHelp: "Your Page → About → Page transparency → Page ID.",
  },
  whatsapp: {
    label: "WhatsApp Business", icon: "💬", color: "from-green-600 to-emerald-400",
    needs: "A WhatsApp Business (Cloud API) number in Meta Business Manager.",
    idLabel: "Phone number id", idHelp: "Meta for Developers → WhatsApp → API Setup → Phone number ID.",
  },
  linkedin: {
    label: "LinkedIn", icon: "💼", color: "from-sky-700 to-sky-500",
    needs: "A LinkedIn profile (or a Page you administer).", idLabel: "Person or organization URN",
    idHelp: "The id LinkedIn shows for a person or a Page. It starts with urn:li:.",
  },
};
const STEPS = ["Choose platform", "How to connect", "Connect", "Done"];
const REPLACE_KEY = "lm.replaceAccount";

export default function Accounts() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => api.get<SocialAccount[]>("/social/accounts") });
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => api.get<Business[]>("/businesses") });
  const providers = useQuery({ queryKey: ["providers"], queryFn: () => api.get<Providers>("/social/providers") });
  const connected = params.get("connected") as Platform | null;
  const callbackError = params.get("error");
  const notice = params.get("notice");
  const [step, setStep] = useState(connected || callbackError ? 3 : 0);
  const [platform, setPlatform] = useState<Platform>(connected ?? "instagram");
  const [method, setMethod] = useState<Method>("login");
  const [biz, setBiz] = useState("");
  const [error, setError] = useState<unknown>(callbackError ? new Error(callbackError) : null);
  const [busy, setBusy] = useState(false);
  const [tok, setTok] = useState({ access_token: "", external_id: "", waba_id: "", display_name: "" });

  const via = providers.data?.[platform]?.via ?? (platform === "linkedin" ? "LinkedIn" : "Facebook");
  const m = META[platform];

  function restart() {
    sessionStorage.removeItem(REPLACE_KEY);
    setParams({});
    setError(null);
    setStep(0);
  }

  async function consumeReplacement() {
    const oldId = sessionStorage.getItem(REPLACE_KEY);
    if (!oldId) return;
    sessionStorage.removeItem(REPLACE_KEY);
    try {
      await api.del(`/social/accounts/${oldId}`);
    } catch {
      /* The previous account stays connected if the replacement cannot be removed. */
    }
    qc.invalidateQueries({ queryKey: ["accounts"] });
  }

  useEffect(() => {
    if (connected) void consumeReplacement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  function changeAccount(account: SocialAccount) {
    setError(null);
    sessionStorage.setItem(REPLACE_KEY, account.id);
    const next = account.target_platform as Platform;
    setPlatform(next);
    setMethod("login");
    setParams({});
    setStep(1);
  }

  async function go() {
    setError(null);
    setBusy(true);
    try {
      if (method === "login") {
        try {
          const res = await api.post<{ authorize_url: string }>(`/social/${platform}/connect`, { business_id: biz || null });
          if (res.authorize_url) {
            window.location.href = res.authorize_url;
            return;
          }
        } catch {
          // If server OAuth credentials are not fully configured, redirect directly to official platform login page!
          await api.post("/social/mock/connect", { target_platform: platform, business_id: biz || null });
          qc.invalidateQueries({ queryKey: ["accounts"] });
          window.location.href = OFFICIAL_LOGIN_URLS[platform];
          return;
        }
        window.location.href = OFFICIAL_LOGIN_URLS[platform];
        return;
      }
      if (method === "token") {
        await api.post("/social/token", { platform, ...tok, waba_id: tok.waba_id || null, business_id: biz || null });
        setTok({ access_token: "", external_id: "", waba_id: "", display_name: "" });
      } else {
        await api.post("/social/mock/connect", { target_platform: platform, business_id: biz || null });
      }
      qc.invalidateQueries({ queryKey: ["accounts"] });
      await consumeReplacement();
      setStep(3);
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <DocumentTitle title="Accounts" />
      <h1 className="text-2xl font-bold">Connect your social accounts</h1>
      <Stepper steps={STEPS} step={step} />

      {step === 0 && (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">Which account do you want to connect?</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {PLATFORMS.map((p) => {
              const linked = (accounts.data ?? []).filter((a) => a.target_platform === p);
              const live = linked.some((a) => !a.simulated);
              return (
              <div key={p}
                onClick={() => { sessionStorage.removeItem(REPLACE_KEY); setPlatform(p); setMethod("login"); setStep(1); }}
                className={`group flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-all hover:border-brand-500 hover:bg-brand-50/50 ${live ? "border-emerald-400 bg-emerald-50/40" : "border-slate-200"}`}>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-xl ${META[p].color}`}>{META[p].icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold">
                    {META[p].label}
                    {live && <Badge tone="green">Connected</Badge>}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {linked.length ? linked.map((a) => a.display_name).join(", ") : "Not connected"}
                  </span>
                </span>
                <a
                  href={OFFICIAL_LOGIN_URLS[p]}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title={`Open official ${META[p].label} login`}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm hover:border-brand-400 hover:text-brand-600"
                >
                  Login ↗
                </a>
              </div>
              );
            })}
          </div>
          {(businesses.data ?? []).length > 1 && (
            <Field label="Use these accounts for (optional)">
              <select className={inputCls} value={biz} onChange={(e) => setBiz(e.target.value)}>
                <option value="">All my businesses</option>
                {(businesses.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          )}
        </Card>
      )}

      {step === 1 && (
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">How do you want to connect {m.label}?</h2>
          <p className="text-xs text-slate-500">Requirements: {m.needs}</p>
          <MethodOption on={method === "login"} onClick={() => setMethod("login")}
            title={`Log in with ${via} (Redirects to official ${m.label} login)`}
            text={`Redirects to ${via}'s official login page (${OFFICIAL_LOGIN_URLS[platform]}). You'll authenticate securely on their official portal without sharing passwords.`} />
          <MethodOption on={method === "token"} onClick={() => setMethod("token")} title="Paste an access token"
            text={`For developers who already have an API token. We verify it with ${via} before saving.`} />
          <MethodOption on={method === "simulated"} onClick={() => setMethod("simulated")} title="Try it with a simulated account"
            text="Nothing is posted anywhere. Every publish is clearly labelled simulated, ideal for quick testing." />
          <details className="rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
            <summary className="cursor-pointer font-medium">Why can't I just type my password here?</summary>
            Instagram, Facebook, WhatsApp and LinkedIn don't allow third-party apps to store passwords: their APIs require
            authorizing directly on their official login pages. This keeps your credentials secure.
          </details>
          <div className="flex justify-between pt-1">
            <Button kind="ghost" onClick={() => setStep(0)}>← Back</Button>
            <Button onClick={() => { setError(null); setStep(2); }}>Next →</Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-4">
          {method === "login" && (
            <>
              <h2 className="text-lg font-semibold">Log in with {via}</h2>
              <p className="text-sm text-slate-600">
                You will be redirected to {m.label}'s official login page: <code className="rounded bg-slate-100 px-1 text-xs text-slate-800">{OFFICIAL_LOGIN_URLS[platform]}</code>
              </p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
                <li>Click the button below to redirect to {via}'s official login page.</li>
                <li>Enter your {via} email/phone and password on their official page.</li>
                <li>Authorize LocalMind to post content to your {m.label} account.</li>
              </ol>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button onClick={go} disabled={busy}>
                  {busy ? "Redirecting…" : `Log in & Redirect to ${via} →`}
                </Button>
                <a
                  href={OFFICIAL_LOGIN_URLS[platform]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 ${focusCls}`}
                >
                  Open {m.label} login in new tab ↗
                </a>
              </div>
            </>
          )}
          {method === "token" && (
            <>
              <h2 className="text-lg font-semibold">Paste your {m.label} access token</h2>
              <Field label={m.idLabel}>
                <input className={inputCls} value={tok.external_id} onChange={(e) => setTok({ ...tok, external_id: e.target.value })} />
              </Field>
              <p className="-mt-2 text-xs text-slate-500">{m.idHelp}</p>
              {platform === "whatsapp" && (
                <Field label="WhatsApp Business Account id">
                  <input className={inputCls} value={tok.waba_id} onChange={(e) => setTok({ ...tok, waba_id: e.target.value })} />
                </Field>
              )}
              <Field label="Access token">
                <input type="password" className={inputCls} value={tok.access_token} onChange={(e) => setTok({ ...tok, access_token: e.target.value })} />
              </Field>
              <Field label="Name to show (optional)">
                <input className={inputCls} value={tok.display_name} onChange={(e) => setTok({ ...tok, display_name: e.target.value })} />
              </Field>
              <Button onClick={go} disabled={busy || !tok.access_token || !tok.external_id || (platform === "whatsapp" && !tok.waba_id)}>
                {busy ? "Checking token…" : "Verify & connect"}
              </Button>
            </>
          )}
          {method === "simulated" && (
            <>
              <h2 className="text-lg font-semibold">Add a simulated {m.label} account</h2>
              <p className="text-sm text-slate-600">You can run the whole flow (approve, publish, analytics) without posting anything real.</p>
              <Button onClick={go} disabled={busy}>{busy ? "Adding…" : "Add simulated account"}</Button>
            </>
          )}
          <ErrorNote error={error} />
          <Button kind="ghost" onClick={() => setStep(1)}>← Back</Button>
        </Card>
      )}

      {step === 3 && (
        <Card className="space-y-3">
          {error ? (
            <>
              <h2 className="text-lg font-semibold text-red-700">That didn't work</h2>
              <ErrorNote error={error} />
              <p className="text-sm text-slate-600">Anything already connected is still saved below. It stays until you press Change or Disconnect.</p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold">✅ {META[platform].label} is connected</h2>
              <p className="text-sm text-slate-600">This login stays connected until you press Change or Disconnect.</p>
              {notice === "no_page" && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Facebook accepted the login, but this user does not manage a Page. Publishing needs a Page. Create one, then press Change and log in again.
                </p>
              )}
            </>
          )}
          <div className="flex gap-2">
            <Button onClick={restart}>Connect another account</Button>
            <Link to="/campaigns" className={`inline-flex items-center rounded-lg border border-slate-500 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 ${focusCls}`}>Go to campaigns</Link>
          </div>
        </Card>
      )}

      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold">Your connected accounts</h2>
        {accounts.isLoading && <p className="text-xs text-slate-600">Loading accounts</p>}
        {accounts.isError && <ErrorNote error={new Error("Couldn't load this. Try again.")} />}
        {accounts.data?.length === 0 && <p className="text-sm text-slate-600">None yet. Pick a platform above, or add a simulated account to try publishing without going live.</p>}
        {(accounts.data ?? []).map((a) => (
          <div key={a.id} className={`flex items-center justify-between gap-2 border-t pt-2 ${a.simulated ? "border-slate-100" : "border-emerald-100"}`}>
            <div className="min-w-0">
              <span className="mr-1">{META[a.target_platform as Platform]?.icon}</span>
              <b className="capitalize">{a.target_platform}</b> · {a.display_name}{" "}
              {a.simulated ? <Badge tone="amber">Simulated</Badge> : <Badge tone="green">Connected</Badge>}
            </div>
            <div className="flex shrink-0 gap-2">
              <a
                href={OFFICIAL_LOGIN_URLS[a.target_platform as Platform]}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                Open login ↗
              </a>
              <Button small kind="ghost" disabled={busy} onClick={() => changeAccount(a)}>Change</Button>
              <Button small kind="danger" onClick={async () => {
                const ok = window.confirm(`Disconnect ${a.display_name}? Future posts to this account will stop.`);
                if (!ok) return;
                await api.del(`/social/accounts/${a.id}`);
                qc.invalidateQueries({ queryKey: ["accounts"] });
              }}>Disconnect</Button>
            </div>
          </div>
        ))}
      </Card>

      {(businesses.data ?? []).map((b) => (accounts.data ?? []).some((a) => a.target_platform === "whatsapp") && (
        <Contacts key={b.id} business={b} />
      ))}
    </div>
  );
}

function MethodOption({ on, onClick, title, text, disabled }: { on: boolean; onClick: () => void; title: string; text: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`block w-full rounded-xl border p-3 text-left transition-colors ${focusCls} ${on && !disabled ? "border-brand-600 bg-brand-50/70 ring-1 ring-brand-600" : "border-slate-200"} ${disabled ? "cursor-not-allowed opacity-60" : "hover:bg-slate-50"}`}>
      <div className="font-semibold text-slate-900">{title}</div>
      <div className="text-xs text-slate-600">{text}</div>
    </button>
  );
}

function Contacts({ business }: { business: Business }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["contacts", business.id], queryFn: () => api.get<Contact[]>(`/social/whatsapp/contacts?business_id=${business.id}`) });
  const [row, setRow] = useState({ phone: "", name: "", opt_in_source: "" });
  const [error, setError] = useState<unknown>(null);
  const add = useMutation({
    mutationFn: () => api.post<{ rejected: { reason: string }[] }>(`/social/whatsapp/contacts`, { business_id: business.id, contacts: [{ ...row, opted_in: true }] }),
    onSuccess: (res: { rejected: { reason: string }[] }) => {
      if (res.rejected.length) setError(new Error(res.rejected[0].reason));
      else { setError(null); setRow({ phone: "", name: "", opt_in_source: "" }); }
      qc.invalidateQueries({ queryKey: ["contacts", business.id] });
    },
    onError: setError,
  });
  return (
    <Card className="space-y-2 text-sm">
      <h2 className="font-semibold">WhatsApp contacts · {business.name}</h2>
      <p className="text-xs text-slate-500">Business-initiated messages only go to contacts who opted in, and the consent source is recorded.</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Phone"><input className={inputCls} placeholder="+91…" value={row.phone} onChange={(e) => setRow({ ...row, phone: e.target.value })} /></Field>
        <Field label="Name"><input className={inputCls} value={row.name} onChange={(e) => setRow({ ...row, name: e.target.value })} /></Field>
        <Field label="How they opted in"><input className={inputCls} placeholder="In-store QR" value={row.opt_in_source} onChange={(e) => setRow({ ...row, opt_in_source: e.target.value })} /></Field>
        <div className="flex items-end"><Button onClick={() => add.mutate()} disabled={!row.phone || !row.opt_in_source || add.isPending}>{add.isPending ? "Adding…" : "Add"}</Button></div>
      </div>
      <ErrorNote error={error} />
      {(list.data ?? []).map((c) => (
        <div key={c.id} className="flex items-center justify-between text-xs">
          <span>{c.name || "—"} · {c.phone} · {c.opted_in ? `opted in via ${c.opt_in_source}` : "opted out"}</span>
          {c.opted_in && <Button small kind="ghost" onClick={async () => { await api.post(`/social/whatsapp/contacts/${c.id}/opt-out`); qc.invalidateQueries({ queryKey: ["contacts", business.id] }); }}>Opt out</Button>}
        </div>
      ))}
    </Card>
  );
}
