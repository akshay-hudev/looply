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
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-200 bg-white px-6 py-3">
        <Link to="/" className={`leading-tight ${focusCls}`}>
          <span className="block text-lg font-bold text-brand-700">Looply</span>
          <span className="block text-xs text-slate-600">Campaigns in your customers' language</span>
        </Link>
        <nav className="flex gap-4 text-sm">
          <NavLink to="/" end className={({ isActive }) => `py-2 ${focusCls} ${isActive ? "font-semibold text-brand-700" : "text-slate-600"}`}>Home</NavLink>
          <NavLink to="/campaigns" className={({ isActive }) => `py-2 ${focusCls} ${isActive ? "font-semibold text-brand-700" : "text-slate-600"}`}>Campaigns</NavLink>
          <NavLink to="/accounts" className={({ isActive }) => `py-2 ${focusCls} ${isActive ? "font-semibold text-brand-700" : "text-slate-600"}`}>Accounts</NavLink>
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
      <main className="mx-auto max-w-6xl px-6 py-6"><Outlet /></main>
    </div>
  );
}
