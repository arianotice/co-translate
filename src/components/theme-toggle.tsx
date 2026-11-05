"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

import { useLocale } from "@/lib/locale";
import { useTheme, type ThemeChoice } from "@/lib/theme";

const ORDER: ThemeChoice[] = ["system", "light", "dark"];

export function ThemeToggle() {
  const { t } = useLocale();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current = theme || "system";
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;
  const label = current === "light" ? t.themeLight : current === "dark" ? t.themeDark : t.themeSystem;

  return (
    <button
      type="button"
      className="icon-flow theme-toggle"
      aria-label={t.themeAria}
      title={mounted ? label : t.themeSystem}
      onClick={() => {
        const index = ORDER.indexOf(current);
        setTheme(ORDER[(index + 1) % ORDER.length]);
      }}
    >
      <Icon className="size-3.5" />
      <span suppressHydrationWarning>{mounted ? label : t.themeSystem}</span>
    </button>
  );
}
