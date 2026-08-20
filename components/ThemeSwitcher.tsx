"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { useLocale } from "@/components/LocaleProvider";
import { useTheme, type ThemeChoice } from "@/components/ThemeProvider";

const COPY = {
  "zh-CN": { light: "设为浅色主题", dark: "设为深色主题", system: "设为系统主题" },
  "zh-TW": { light: "設為淺色主題", dark: "設為深色主題", system: "設為系統主題" },
  en: { light: "Use light theme", dark: "Use dark theme", system: "Use system theme" },
} as const;

const choices: Array<{ value: ThemeChoice; label: "light" | "dark" | "system"; icon: typeof Sun }> = [
  { value: "light", label: "light", icon: Sun },
  { value: "dark", label: "dark", icon: Moon },
  { value: "system", label: "system", icon: Monitor },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const { locale } = useLocale();
  const copy = COPY[locale];
  return (
    <div className="theme-switcher" data-material="clear">
      {choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          data-focusable
          aria-label={copy[choice.label]}
          aria-pressed={theme === choice.value}
          onClick={() => setTheme(choice.value)}
        >
          <Icon source={choice.icon} size={18} />
        </button>
      ))}
    </div>
  );
}
