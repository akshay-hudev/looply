import { useEffect, useState } from "react";

import { focusCls, selectedCls } from "./ui";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "lm.theme";

export function readTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch { /* private mode */ }
  return "system";
}

export function applyTheme(theme: ThemeChoice) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(KEY, theme); } catch { /* private mode */ }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyTheme("system");
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [theme]);

  return (
    <div role="radiogroup" aria-label="Theme" className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
      {(["light", "dark", "system"] as const).map((choice) => (
        <button
          key={choice}
          type="button"
          role="radio"
          aria-checked={theme === choice}
          onClick={() => setTheme(choice)}
          className={`rounded-md px-2 py-1.5 capitalize ${focusCls} ${theme === choice ? selectedCls : "text-slate-600"}`}
        >
          {choice}
        </button>
      ))}
    </div>
  );
}
