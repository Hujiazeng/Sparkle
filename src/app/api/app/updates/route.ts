import { NextResponse } from "next/server";
import { getRuntimeArchitectureInfo } from "@/lib/platform";
import { parseGenericUpdateInfo } from "@/lib/update-release";

const UPDATE_BASE_URL = "https://cdn-oss.pilihu.vip/sparkle/releases/";
const UPDATE_FEED_URL = `${UPDATE_BASE_URL}latest.yml`;

function noUpdatePayload(currentVersion: string, runtimeInfo: ReturnType<typeof getRuntimeArchitectureInfo>) {
  return {
    latestVersion: currentVersion,
    currentVersion,
    updateAvailable: false,
    releaseName: "",
    releaseNotes: "",
    publishedAt: "",
    releaseUrl: "",
    downloadUrl: "",
    downloadAssetName: "",
    detectedPlatform: runtimeInfo.platform,
    detectedArch: runtimeInfo.processArch,
    hostArch: runtimeInfo.hostArch,
    runningUnderRosetta: runtimeInfo.runningUnderRosetta,
  };
}

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function GET() {
  try {
    const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
    const runtimeInfo = getRuntimeArchitectureInfo();

    const res = await fetch(UPDATE_FEED_URL, { next: { revalidate: 300 } });

    if (!res.ok) {
      return NextResponse.json(noUpdatePayload(currentVersion, runtimeInfo));
    }

    const updateInfo = parseGenericUpdateInfo(await res.text());
    const latestVersion = (updateInfo.version || "").replace(/^v/, "");
    if (!latestVersion) {
      return NextResponse.json(noUpdatePayload(currentVersion, runtimeInfo));
    }

    const updateAvailable = compareSemver(latestVersion, currentVersion) > 0;
    const downloadAssetName = updateInfo.path || updateInfo.files?.[0]?.url || "";
    const downloadUrl = downloadAssetName
      ? new URL(downloadAssetName, UPDATE_BASE_URL).toString()
      : UPDATE_BASE_URL;

    return NextResponse.json({
      latestVersion,
      currentVersion,
      updateAvailable,
      releaseName: updateInfo.releaseName || `Sparkle v${latestVersion}`,
      releaseNotes: updateInfo.releaseNotes || "",
      publishedAt: updateInfo.releaseDate || "",
      releaseUrl: UPDATE_BASE_URL,
      downloadUrl,
      downloadAssetName,
      detectedPlatform: runtimeInfo.platform,
      detectedArch: runtimeInfo.processArch,
      hostArch: runtimeInfo.hostArch,
      runningUnderRosetta: runtimeInfo.runningUnderRosetta,
    });
  } catch {
    const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
    const runtimeInfo = getRuntimeArchitectureInfo();
    return NextResponse.json(noUpdatePayload(currentVersion, runtimeInfo));
  }
}
