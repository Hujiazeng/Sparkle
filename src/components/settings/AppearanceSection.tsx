"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { useThemeFamily } from "@/lib/theme/context";
import { useTranslation } from "@/hooks/useTranslation";
import { Sun, Moon, Desktop } from "@/components/ui/icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SettingsCard } from "@/components/patterns/SettingsCard";
import { FieldRow } from "@/components/patterns/FieldRow";

// ── Theme Mode Pill Selector ────────────────────────────────────────

const MODE_OPTIONS = [
  { value: "light", icon: Sun, labelKey: "settings.modeLight" as const },
  { value: "dark", icon: Moon, labelKey: "settings.modeDark" as const },
  { value: "system", icon: Desktop, labelKey: "settings.modeSystem" as const },
] as const;

function ThemeModePills({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center rounded-lg border border-border/50 p-1 gap-1" role="radiogroup">
      {MODE_OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <Button
            key={opt.value}
            variant="ghost"
            size="sm"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all h-auto",
              selected
                ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <opt.icon size={14} />
            {t(opt.labelKey)}
          </Button>
        );
      })}
    </div>
  );
}

// ── Main Appearance Section ─────────────────────────────────────────

/** Persist theme setting to DB so it survives across sessions */
function persistThemeSetting(key: string, value: string) {
  fetch('/api/settings/app', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings: { [key]: value } }),
  }).catch(() => { /* best-effort */ });
}

export function AppearanceSection() {
  const { theme, setTheme: setThemeRaw, resolvedTheme } = useTheme();
  const { family, setFamily: setFamilyRaw, families } = useThemeFamily();
  const { t } = useTranslation();

  const setTheme = useCallback((mode: string) => {
    setThemeRaw(mode);
    persistThemeSetting('theme_mode', mode);
  }, [setThemeRaw]);

  const setFamily = useCallback((id: string) => {
    setFamilyRaw(id);
    persistThemeSetting('theme_family', id);
  }, [setFamilyRaw]);

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  if (!mounted) return null;

  return (
    <div className="space-y-4">
      {/* Section header — outside card */}
      <div>
        <h2 className="text-sm font-medium">{t("settings.appearance")}</h2>
        <p className="text-xs text-muted-foreground">{t("settings.appearanceDesc")}</p>
      </div>

      <SettingsCard>
      {/* Mode */}
      <FieldRow
        label={t("settings.themeMode")}
        description={t("settings.themeModeDesc")}
      >
        <ThemeModePills value={theme || "system"} onChange={setTheme} />
      </FieldRow>

      {theme === "system" && resolvedTheme && (
        <p className="text-[11px] text-muted-foreground pl-1">
          {resolvedTheme === "dark" ? t("settings.modeDark") : t("settings.modeLight")}
        </p>
      )}

      {/* Family */}
      <FieldRow
        label={t("settings.themeFamily")}
        description={t("settings.themeFamilyDesc")}
        separator
      >
        <Select value={family} onValueChange={setFamily}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {families.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                <span className="flex items-center gap-2">
                  {f.previewColors && (
                    <span className="flex gap-0.5">
                      <span
                        className="inline-block h-3 w-3 rounded-full border border-border/30"
                        style={{ background: f.previewColors.primaryLight }}
                      />
                      <span
                        className="inline-block h-3 w-3 rounded-full border border-border/30"
                        style={{ background: f.previewColors.primaryDark }}
                      />
                    </span>
                  )}
                  <span className="text-xs">{f.label}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      </SettingsCard>
    </div>
  );
}
