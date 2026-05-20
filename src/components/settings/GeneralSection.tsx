"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ArrowClockwise, SpinnerGap } from "@/components/ui/icon";
import { useUpdate } from "@/hooks/useUpdate";
import { useTranslation } from "@/hooks/useTranslation";
import { SUPPORTED_LOCALES, type Locale } from "@/i18n";
import type { TranslationKey } from "@/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsCard } from "@/components/patterns/SettingsCard";
import { FieldRow } from "@/components/patterns/FieldRow";
import { AppearanceSection } from "./AppearanceSection";

function UpdateCard() {
  const { updateInfo, checking, checkForUpdates, downloadUpdate, quitAndInstall, setShowDialog } = useUpdate();
  const { t } = useTranslation();
  const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";

  const isDownloading = updateInfo?.isNativeUpdate && !updateInfo.readyToInstall
    && updateInfo.downloadProgress != null;

  return (
    <SettingsCard>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">{t('settings.codepilot')}</h2>
          <p className="text-xs text-muted-foreground">{t('settings.version', { version: currentVersion })}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Show install/restart button when update available */}
          {updateInfo?.updateAvailable && !checking && (
            updateInfo.readyToInstall ? (
              <Button size="sm" onClick={quitAndInstall}>
                {t('update.restartToUpdate')}
              </Button>
            ) : updateInfo.isNativeUpdate && !isDownloading ? (
              <Button size="sm" onClick={downloadUpdate}>
                {t('update.installUpdate')}
              </Button>
            ) : !updateInfo.isNativeUpdate ? (
              <Button size="sm" variant="outline" onClick={() => window.open(updateInfo.releaseUrl, "_blank")}>
                {t('settings.viewRelease')}
              </Button>
            ) : null
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={checkForUpdates}
            disabled={checking}
            className="gap-2"
          >
            {checking ? (
              <SpinnerGap size={14} className="animate-spin" />
            ) : (
              <ArrowClockwise size={14} />
            )}
            {checking ? t('settings.checking') : t('settings.checkForUpdates')}
          </Button>
        </div>
      </div>

      {updateInfo && !checking && (
        <div className="mt-3">
          {updateInfo.updateAvailable ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${updateInfo.readyToInstall ? 'bg-status-success' : isDownloading ? 'bg-status-warning animate-pulse' : 'bg-primary'}`} />
                <span className="text-sm">
                  {updateInfo.readyToInstall
                    ? t('update.readyToInstall', { version: updateInfo.latestVersion })
                    : isDownloading
                      ? `${t('update.downloading')} ${Math.round(updateInfo.downloadProgress!)}%`
                      : t('settings.updateAvailable', { version: updateInfo.latestVersion })}
                </span>
                {updateInfo.releaseNotes && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs text-muted-foreground"
                    onClick={() => setShowDialog(true)}
                  >
                    {t('gallery.viewDetails')}
                  </Button>
                )}
              </div>
              {/* Download progress bar */}
              {isDownloading && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(updateInfo.downloadProgress!, 100)}%` }}
                  />
                </div>
              )}
              {updateInfo.lastError && (
                <p className="text-xs text-status-error-foreground">
                  {updateInfo.lastError}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('settings.latestVersion')}</p>
          )}
        </div>
      )}
    </SettingsCard>
  );
}

export function GeneralSection() {
  const { t, locale, setLocale } = useTranslation();

  return (
    <div className="max-w-3xl space-y-6">
      <UpdateCard />

      <SettingsCard>
        <FieldRow
          label={t('settings.language')}
          description={t('settings.languageDesc')}
        >
          <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LOCALES.map((l) => (
                <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>

        <FieldRow
          label={t('setup.openSetupCenter')}
          description={t('setup.openSetupCenterDesc')}
          separator
        >
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => window.dispatchEvent(new CustomEvent('open-setup-center'))}
          >
            {t('setup.open')}
          </Button>
        </FieldRow>

        <SentryToggle locale={locale} t={t} />
      </SettingsCard>

      <AppearanceSection />
    </div>
  );
}

/* ── Sentry opt-out toggle (isolated state) ──────────────────── */

const sentrySubscribe = (cb: () => void) => {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
};
const getSentryEnabled = () => {
  try { return localStorage.getItem('codepilot:sentry-disabled') !== 'true'; } catch { return true; }
};
const getSentryEnabledServer = () => true; // SSR default

function SentryToggle({ locale, t }: { locale: string; t: (key: TranslationKey) => string }) {
  const enabled = useSyncExternalStore(sentrySubscribe, getSentryEnabled, getSentryEnabledServer);

  return (
    <FieldRow
      label={t('settings.errorReporting' as TranslationKey)}
      description={t('settings.errorReportingDesc' as TranslationKey)}
      separator
    >
      <Switch
        checked={enabled}
        onCheckedChange={(checked) => {
          const disabled = !checked;
          try {
            localStorage.setItem('codepilot:sentry-disabled', disabled ? 'true' : 'false');
            window.dispatchEvent(new StorageEvent('storage'));
          } catch { /* ignore */ }
          fetch('/api/settings/sentry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ disabled }),
          }).catch(() => { /* ignore */ });
        }}
      />
    </FieldRow>
  );
}
