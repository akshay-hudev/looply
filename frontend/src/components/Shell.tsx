import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";

import { api, auth } from "../lib/api";
import { Me } from "../lib/types";

export default function Shell() {
  const nav = useNavigate();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/auth/me") });
  const orgs = me.data?.organizations ?? [];

  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-6 border-b border-slate-200 bg-white px-6 py-3">
        <Link to="/" className="text-lg font-bold text-brand-700">LocalMind</Link>
        <nav className="flex gap-4 text-sm">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "font-semibold text-brand-700" : "text-slate-600")}>Campaigns</NavLink>
          <NavLink to="/accounts" className={({ isActive }) => (isActive ? "font-semibold text-brand-700" : "text-slate-600")}>Accounts</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {orgs.length > 1 && (
            <select className="rounded border border-slate-300 px-2 py-1" value={auth.org() ?? ""}
              onChange={(e) => { auth.setOrg(e.target.value); location.reload(); }}>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.role})</option>)}
            </select>
          )}
          <span className="text-slate-500">{me.data?.name}</span>
          <button className="text-slate-500 underline" onClick={() => { auth.clear(); nav("/login"); }}>Log out</button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6"><Outlet /></main>
    </div>
  );
}
