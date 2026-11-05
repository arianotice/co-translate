"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";

const KEY = "heyi.theme";
const LEGACY_KEY = "theme";

function systemDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  return choice === "system" ? (systemDark() ? "dark" : "light") : choice;
}

function readStoredTheme(): ThemeChoice {
  const saved = window.localStorage.getItem(KEY) || window.localStorage.getItem(LEGACY_KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
}

export function applyTheme(choice: ThemeChoice) {
  const resolved = resolveTheme(choice);
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(resolved);
  document.documentElement.style.colorScheme = resolved;
}

const ThemeContext = createContext<{
  theme: ThemeChoice;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemeChoice) => void;
}>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => undefined,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const choice = readStoredTheme();
    setThemeState(choice);
    setResolvedTheme(resolveTheme(choice));
    applyTheme(choice);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const current = readStoredTheme();
      if (current !== "system") return;
      setResolvedTheme(resolveTheme("system"));
      applyTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme: (next: ThemeChoice) => {
        window.localStorage.setItem(KEY, next);
        setThemeState(next);
        setResolvedTheme(resolveTheme(next));
        applyTheme(next);
      },
    }),
    [theme, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
