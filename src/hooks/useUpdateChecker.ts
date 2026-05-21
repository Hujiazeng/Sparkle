"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { UpdateInfo, UpdateContextValue } from "@/hooks/useUpdate";

const CHECK_INTERVAL = 8 * 60 * 60 * 1000; // 8 hours
const DISMISSED_VERSION_KEY = "codepilot_dismissed_update_version";

/**
 * Encapsulates all update-checking logic (native Electron updater + browser fallback).
 * Returns a memoised context value suitable for UpdateContext.Provider.
 */
export function useUpdateChecker(): UpdateContextValue {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  // Runtime detection: native updater available when running in Electron with updater bridge
  const isNativeUpdater = typeof window !== "undefined" && !!window.electronAPI?.updater;

  const fetchBrowserUpdateInfo = useCallback(async (): Promise<UpdateInfo | null> => {
    const res = await fetch("/api/app/updates");
    if (!res.ok) return null;
    const data = await res.json();
    return {
      ...data,
      downloadProgress: null,
      readyToInstall: false,
      isNativeUpdate: false,
      lastError: null,
    };
  }, []);

  // --- Native updater status listener ---
  useEffect(() => {
    if (!isNativeUpdater) return;
    const cleanup = window.electronAPI!.updater!.onStatus((event) => {
      switch (event.status) {
        case 'available':
          setUpdateInfo((prev) => ({
            updateAvailable: true,
            latestVersion: event.info?.version ?? prev?.latestVersion ?? '',
            currentVersion: prev?.currentVersion ?? '',
            releaseName: event.info?.releaseName ?? prev?.releaseName ?? '',
            releaseNotes: typeof event.info?.releaseNotes === 'string' ? event.info.releaseNotes : prev?.releaseNotes ?? '',
            releaseUrl: prev?.releaseUrl ?? '',
            publishedAt: event.info?.releaseDate ?? prev?.publishedAt ?? '',
            downloadProgress: null,
            readyToInstall: false,
            isNativeUpdate: true,
            lastError: null,
            forceUpdate: prev?.forceUpdate ?? false,
            minSupportedVersion: prev?.minSupportedVersion ?? '',
            policyMessage: prev?.policyMessage ?? '',
          }));
          {
            const ver = event.info?.version;
            const dismissed = localStorage.getItem(DISMISSED_VERSION_KEY);
            if (ver && dismissed !== ver) {
              setShowDialog(true);
            }
          }
          fetchBrowserUpdateInfo().then((policyInfo) => {
            if (!policyInfo) return;
            setUpdateInfo((prev) => {
              if (!prev) return { ...policyInfo, isNativeUpdate: true };
              return {
                ...prev,
                currentVersion: policyInfo.currentVersion || prev.currentVersion,
                releaseUrl: policyInfo.releaseUrl || prev.releaseUrl,
                downloadUrl: policyInfo.downloadUrl || prev.downloadUrl,
                downloadAssetName: policyInfo.downloadAssetName || prev.downloadAssetName,
                detectedPlatform: policyInfo.detectedPlatform ?? prev.detectedPlatform,
                detectedArch: policyInfo.detectedArch ?? prev.detectedArch,
                hostArch: policyInfo.hostArch ?? prev.hostArch,
                runningUnderRosetta: policyInfo.runningUnderRosetta ?? prev.runningUnderRosetta,
                forceUpdate: policyInfo.forceUpdate ?? false,
                minSupportedVersion: policyInfo.minSupportedVersion ?? '',
                policyMessage: policyInfo.policyMessage ?? '',
                isNativeUpdate: true,
              };
            });
            if (policyInfo.forceUpdate) {
              setShowDialog(true);
            }
          }).catch(() => {
            // Policy metadata is best-effort; native update availability still works.
          });
          break;
        case 'not-available':
          setUpdateInfo((prev) => prev ? { ...prev, updateAvailable: false, isNativeUpdate: true, lastError: null, forceUpdate: false } : prev);
          break;
        case 'downloading':
          setUpdateInfo((prev) => prev ? {
            ...prev,
            downloadProgress: event.progress?.percent ?? prev.downloadProgress,
            isNativeUpdate: true,
            lastError: null,
          } : prev);
          break;
        case 'downloaded':
          setUpdateInfo((prev) => prev ? {
            ...prev,
            readyToInstall: true,
            downloadProgress: 100,
            isNativeUpdate: true,
            lastError: null,
          } : prev);
          break;
        case 'error':
          setUpdateInfo((prev) => prev ? {
            ...prev,
            lastError: event.error ?? 'Unknown error',
            isNativeUpdate: true,
          } : prev);
          break;
      }
      if (event.status === 'checking') {
        setChecking(true);
      } else {
        setChecking(false);
      }
    });
    return cleanup;
  }, [fetchBrowserUpdateInfo, isNativeUpdater]);

  // --- Browser-mode update check (fallback for non-Electron) ---
  const checkForUpdatesBrowser = useCallback(async () => {
    setChecking(true);
    try {
      const info = await fetchBrowserUpdateInfo();
      if (!info) return;
      setUpdateInfo(info);

      if (info.updateAvailable) {
        const dismissed = localStorage.getItem(DISMISSED_VERSION_KEY);
        if (info.forceUpdate || dismissed !== info.latestVersion) {
          setShowDialog(true);
        }
      }
    } catch {
      // silently ignore network errors
    } finally {
      setChecking(false);
    }
  }, [fetchBrowserUpdateInfo]);

  // --- Unified check: native first, browser fallback ---
  const checkForUpdates = useCallback(async () => {
    if (isNativeUpdater) {
      try {
        await window.electronAPI!.updater!.checkForUpdates();
        return;
      } catch {
        // native check failed, fall through to browser mode
      }
    }
    await checkForUpdatesBrowser();
  }, [isNativeUpdater, checkForUpdatesBrowser]);

  // Browser mode: periodic check (non-Electron or as fallback)
  useEffect(() => {
    if (isNativeUpdater) return; // native updater handles its own initial check
    checkForUpdatesBrowser();
    const id = setInterval(checkForUpdatesBrowser, CHECK_INTERVAL);
    return () => clearInterval(id);
  }, [isNativeUpdater, checkForUpdatesBrowser]);

  const dismissUpdate = useCallback(() => {
    if (updateInfo?.forceUpdate) return;
    setShowDialog(false);
  }, [updateInfo?.forceUpdate]);

  const downloadUpdate = useCallback(async () => {
    if (isNativeUpdater) {
      await window.electronAPI!.updater!.downloadUpdate();
    }
  }, [isNativeUpdater]);

  const quitAndInstall = useCallback(() => {
    if (isNativeUpdater) {
      window.electronAPI!.updater!.quitAndInstall();
    }
  }, [isNativeUpdater]);

  return useMemo(
    () => ({
      updateInfo,
      checking,
      checkForUpdates,
      downloadUpdate,
      dismissUpdate,
      showDialog,
      setShowDialog,
      quitAndInstall,
    }),
    [updateInfo, checking, checkForUpdates, downloadUpdate, dismissUpdate, showDialog, quitAndInstall]
  );
}
