import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";

import { api, auth } from "../lib/api";
import { Me } from "../lib/types";
import { ThemeToggle } from "../lib/theme";
import { fieldCls, focusCls } from "../lib/ui";

export default function Shell() {
  const nav = useNavigate();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/auth/me") });
  const orgs = me.data?.organizations ?? [];

  return (
    <div className="min-h-screen">
      <header className="lm-glass sticky top-0 z-40 flex flex-wrap items-center gap-x-6 gap-y-2 border-x-0 border-t-0 px-6 py-3">
        <Link to="/" className={`flex items-center gap-2.5 leading-tight ${focusCls}`}>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 shadow-xs">
            <svg className="h-5 w-5" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="hdrLoop" x1="8" y1="16" x2="56" y2="48" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#ea580c"/>
                  <stop offset="45%" stopColor="#f97316"/>
                  <stop offset="75%" stopColor="#ec4899"/>
                  <stop offset="100%" stopColor="#06b6d4"/>
                </linearGradient>
              </defs>
              <path d="M22 23 C14 23 8 27.5 8 32 C8 36.5 14 41 22 41 C30 41 34 32 42 32 C50 32 56 35 56 32 C56 29 50 23 42 23 C34 23 30 32 22 32" stroke="url(#hdrLoop)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <span className="block font-display text-2xl leading-none tracking-tight text-slate-900">LOOPLY</span>
            <span className="block text-xs font-medium text-slate-500">Your Intent, Amplified</span>
          </div>
        </Link>
        <nav className="flex gap-1 text-sm">
          <NavLink to="/" end className={({ isActive }) => `rounded-full px-3.5 py-1.5 transition-colors ${focusCls} ${isActive ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-600 hover:text-slate-900"}`}>Home</NavLink>
          <NavLink to="/campaigns" className={({ isActive }) => `rounded-full px-3.5 py-1.5 transition-colors ${focusCls} ${isActive ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-600 hover:text-slate-900"}`}>Campaigns</NavLink>
          <NavLink to="/accounts" className={({ isActive }) => `rounded-full px-3.5 py-1.5 transition-colors ${focusCls} ${isActive ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-600 hover:text-slate-900"}`}>Accounts</NavLink>
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
          <ThemeToggle />
          {orgs.length > 1 && (
            <select aria-label="Organization" className={fieldCls} value={auth.org() ?? ""}
              onChange={(e) => { auth.setOrg(e.target.value); location.reload(); }}>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.role})</option>)}
            </select>
          )}
          <span className="text-slate-600">{me.data?.name}</span>
          <button className={`py-2 text-slate-600 underline ${focusCls}`} onClick={() => { auth.clear(); nav("/login"); }}>Log out</button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8"><Outlet /></main>
    </div>
  );
}
