import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type ThemeMode = "light" | "dark" | "system";
const storageKey = "enghub-theme";

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  const resolved = mode === "system" ? (prefersLight ? "light" : "dark") : mode;
  root.dataset.theme = resolved;
  root.dataset.themeMode = mode;
}

export default function ThemeSwitcher() {
  const [mode, setMode] = useState<ThemeMode>(() => (typeof window === "undefined" ? "system" : (localStorage.getItem(storageKey) as ThemeMode) || "system"));
  useEffect(() => {
    applyTheme(mode);
    localStorage.setItem(storageKey, mode);
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => mode === "system" && applyTheme(mode);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);
  return <div className="theme-switcher" aria-label="Theme preference"><span className="theme-switcher-label">Theme</span><div className="theme-switcher-options">{([ ["light", Sun, "Light"], ["dark", Moon, "Dark"], ["system", Monitor, "System"] ] as const).map(([value, Icon, label]) => <button key={value} type="button" className={mode === value ? "theme-option theme-option-active" : "theme-option"} onClick={() => setMode(value)} aria-label={`${label} theme`} title={`${label} theme`}><Icon size={14} /><span>{label}</span></button>)}</div></div>;
}
