"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CaretLeft,
  CaretRight,
  CheckCircle,
  Clock,
  FileAudio,
  FilePlus,
  Gear,
  MagnifyingGlass,
  PencilSimple,
  Play,
  Plus,
  Queue,
  RowsPlusBottom,
  SpinnerGap,
  Trash,
  UploadSimple,
  FolderOpen,
  VideoCamera,
  WarningCircle,
  Waveform,
  XCircle,
} from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showToast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import {
  getDigitalHumanAssetsSnapshot,
  subscribeDigitalHumanAssets,
  type CachedWorkbenchAvatar,
  type CachedWorkbenchVoice,
} from "@/lib/digital-human-assets-cache";

type JobStatus = "draft" | "queued" | "voice" | "video" | "done" | "error";
type JobSource = "script" | "audio";
type StatusFilter = "all" | JobStatus | "running";

type WorkbenchAvatar = CachedWorkbenchAvatar;
type WorkbenchVoice = CachedWorkbenchVoice;

interface ScriptRow {
  id: string;
  batchName: string;
  source: JobSource;
  script: string;
  audioName?: string;
  audioPath?: string;
  audioPreviewUrl?: string;
  audioFile?: File;
  voice: string;
  avatar: string;
  outputPath?: string;
  previewUrl?: string;
  audioTaskId?: string;
  videoTaskId?: string;
  videoUrl?: string;
  duration?: number;
  status: JobStatus;
  progress: number;
  error?: string;
}

const DEFAULT_OUTPUT_ROOT = "results";
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_CONCURRENCY = 3;
const SELECTED_BATCH_STORAGE_KEY = "digital-human:selected-batch";
const DIGITAL_HUMAN_WORKBENCH_STORAGE_KEY = "digital-human:workbench-state";
const WORKBENCH_STATE_API = "/api/digital-human/workbench-state";
const EMPTY_ASSET_ID = "__empty_asset__";
const TABLE_GRID_COLUMNS = "grid-cols-[52px_110px_minmax(280px,1fr)_140px_150px_120px_156px]";

interface WorkbenchStateSnapshot {
  rows: Array<ScriptRowSnapshot>;
  selectedBatchName: string;
  outputRoot: string;
  concurrency: number;
  defaultVoice: string;
  defaultAvatar: string;
  batchSequence: number;
  page: number;
}

interface ScriptRowSnapshot extends Omit<ScriptRow, "audioFile"> {
  audioFile?: undefined;
}

const statusMeta: Record<JobStatus, { label: string; className: string; icon: typeof Clock }> = {
  draft: { label: "草稿", className: "bg-muted text-muted-foreground border-border", icon: Clock },
  queued: { label: "排队中", className: "bg-status-info-muted text-status-info-foreground border-status-info-border", icon: Queue },
  voice: { label: "生成语音", className: "bg-status-warning-muted text-status-warning-foreground border-status-warning-border", icon: Waveform },
  video: { label: "生成视频", className: "bg-status-info-muted text-status-info-foreground border-status-info-border", icon: VideoCamera },
  done: { label: "已完成", className: "bg-status-success-muted text-status-success-foreground border-status-success-border", icon: CheckCircle },
  error: { label: "失败", className: "bg-status-error-muted text-status-error-foreground border-status-error-border", icon: XCircle },
};

function isDoneStatus(status: unknown) {
  return status === 3 || String(status).toLowerCase() === "3";
}

function isFailedStatus(status: unknown) {
  return status === 4 || String(status).toLowerCase() === "4";
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function getDateStamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function getLocalDateFolder(date = new Date()) {
  const stamp = getDateStamp(date);
  return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;
}

function joinPath(...parts: string[]) {
  return parts
    .map((part, index) => index === 0 ? part.replace(/[\\/]+$/g, "") : part.replace(/^[\\/]+|[\\/]+$/g, ""))
    .filter(Boolean)
    .join("\\");
}

function createBatchName(sequence: number, date = new Date()) {
  return `${getDateStamp(date)}${String(sequence).padStart(2, "0")}`;
}

function createRow(index: number, batchName: string, overrides: Partial<ScriptRow> = {}): ScriptRow {
  return {
    id: createId(),
    batchName,
    source: "script",
    script: "",
    voice: EMPTY_ASSET_ID,
    avatar: EMPTY_ASSET_ID,
    status: "draft",
    progress: 0,
    ...overrides,
  };
}

function serializeRow(row: ScriptRow): ScriptRowSnapshot {
  const { audioFile: _audioFile, ...rest } = row;
  return {
    ...rest,
    audioPreviewUrl: rest.audioPreviewUrl?.startsWith("blob:") ? undefined : rest.audioPreviewUrl,
  };
}

function normalizeWorkbenchState(state: Partial<WorkbenchStateSnapshot> | null | undefined): WorkbenchStateSnapshot | null {
  if (!state || !Array.isArray(state.rows)) return null;
  return {
    rows: state.rows.filter(Boolean) as ScriptRowSnapshot[],
    selectedBatchName: typeof state.selectedBatchName === "string" ? state.selectedBatchName : "2026052002",
    outputRoot: typeof state.outputRoot === "string" ? state.outputRoot : DEFAULT_OUTPUT_ROOT,
    concurrency: Number.isFinite(state.concurrency as number) ? Number(state.concurrency) : DEFAULT_CONCURRENCY,
    defaultVoice: typeof state.defaultVoice === "string" ? state.defaultVoice : EMPTY_ASSET_ID,
    defaultAvatar: typeof state.defaultAvatar === "string" ? state.defaultAvatar : EMPTY_ASSET_ID,
    batchSequence: Number.isFinite(state.batchSequence as number) ? Number(state.batchSequence) : 2,
    page: Number.isFinite(state.page as number) ? Number(state.page) : 1,
  };
}

function readWorkbenchState(): WorkbenchStateSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DIGITAL_HUMAN_WORKBENCH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkbenchStateSnapshot> | null;
    return normalizeWorkbenchState(parsed);
  } catch {
    return null;
  }
}

function toRows(snapshotRows: ScriptRowSnapshot[]): ScriptRow[] {
  return snapshotRows.map((row) => ({ ...row, audioFile: undefined }));
}

const initialRows: ScriptRow[] = [
  createRow(1, "2026052001", {
    id: "initial-2026052001-001",
    script: "新品发布第一条口播：用 30 秒讲清楚产品卖点，强调省时、省心和本地交付。",
    status: "done",
    progress: 100,
    outputPath: "D:\\Sparkle\\DigitalHumanExports\\2026-05-20\\2026052001\\001.mp4",
  }),
  createRow(2, "2026052001", {
    id: "initial-2026052001-002",
    source: "audio",
    script: "",
    audioName: "customer-case-voice.wav",
    audioPath: "D:\\素材\\customer-case-voice.wav",
    voice: "calm_host",
    avatar: "business_chen",
    status: "video",
    progress: 68,
  }),
  createRow(1, "2026052002", {
    id: "initial-2026052002-001",
    script: "直播切片开场：先用一个问题抓住用户，再说明这个方案适合谁。",
    voice: "energetic_seller",
    avatar: "anchor_mika",
  }),
];

export function DigitalHumanWorkbench() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAudioRowIdRef = useRef<string | null>(null);
  const restoredBatchRef = useRef(false);
  const [dbStateLoaded, setDbStateLoaded] = useState(false);
  const [localStateLoaded, setLocalStateLoaded] = useState(false);
  const [rows, setRows] = useState<ScriptRow[]>(initialRows);
  const [assetSnapshot, setAssetSnapshot] = useState(getDigitalHumanAssetsSnapshot);
  const [defaultVoice, setDefaultVoice] = useState(EMPTY_ASSET_ID);
  const [defaultAvatar, setDefaultAvatar] = useState(EMPTY_ASSET_ID);
  const [batchSequence, setBatchSequence] = useState(2);
  const [selectedBatchName, setSelectedBatchName] = useState("2026052002");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageJump, setPageJump] = useState("1");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [generateConfirmOpen, setGenerateConfirmOpen] = useState(false);
  const [outputRoot, setOutputRoot] = useState(DEFAULT_OUTPUT_ROOT);
  const [concurrency, setConcurrency] = useState(DEFAULT_CONCURRENCY);
  const [previewRow, setPreviewRow] = useState<ScriptRow | null>(null);

  const batchNames = useMemo(() => Array.from(new Set(rows.map((row) => row.batchName))).sort().reverse(), [rows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (row.batchName !== selectedBatchName) return false;
      if (statusFilter === "running" && row.status !== "voice" && row.status !== "video") return false;
      if (statusFilter !== "all" && statusFilter !== "running" && row.status !== statusFilter) return false;
      if (!term) return true;
      const haystack = [row.script, row.audioName, row.batchName].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [rows, search, selectedBatchName, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / DEFAULT_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * DEFAULT_PAGE_SIZE, currentPage * DEFAULT_PAGE_SIZE);
  const runnableRows = useMemo(() => filteredRows.filter((row) => {
    if (row.status === "done") return false;
    return row.source === "audio" ? !!row.audioName : !!row.script.trim();
  }), [filteredRows]);

  const selectedBatchRows = useMemo(() => rows.filter((row) => row.batchName === selectedBatchName), [rows, selectedBatchName]);
  const stats = useMemo(() => {
    const ready = selectedBatchRows.filter((row) => row.source === "audio" ? row.audioName : row.script.trim()).length;
    const done = selectedBatchRows.filter((row) => row.status === "done").length;
    const running = selectedBatchRows.filter((row) => row.status === "voice" || row.status === "video").length;
    const failed = selectedBatchRows.filter((row) => row.status === "error").length;
    return { total: selectedBatchRows.length, ready, done, running, failed };
  }, [selectedBatchRows]);

  const resetPage = useCallback(() => setPage(1), []);
  const voices = assetSnapshot.voices;
  const voiceProvider = assetSnapshot.voiceProvider === "indextts" ? "indextts" : "skyhuman";
  const avatars = assetSnapshot.avatars;
  const voicesLoading = assetSnapshot.voicesLoading;
  const avatarsLoading = assetSnapshot.avatarsLoading;

  useEffect(() => {
    const unsubscribe = subscribeDigitalHumanAssets(() => setAssetSnapshot(getDigitalHumanAssetsSnapshot()));
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const snapshot = readWorkbenchState();
    if (snapshot) {
      setRows(toRows(snapshot.rows));
      setSelectedBatchName(snapshot.selectedBatchName);
      setOutputRoot(snapshot.outputRoot);
      setConcurrency(snapshot.concurrency);
      setDefaultVoice(snapshot.defaultVoice);
      setDefaultAvatar(snapshot.defaultAvatar);
      setBatchSequence(snapshot.batchSequence);
      setPage(snapshot.page);
      setPageJump(String(snapshot.page));
    }
    setLocalStateLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!localStateLoaded) return;
    fetch(WORKBENCH_STATE_API)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        const snapshot = normalizeWorkbenchState(data?.state);
        if (cancelled || !snapshot) return;
        setRows(toRows(snapshot.rows));
        setSelectedBatchName(snapshot.selectedBatchName);
        setOutputRoot(snapshot.outputRoot);
        setConcurrency(snapshot.concurrency);
        setDefaultVoice(snapshot.defaultVoice);
        setDefaultAvatar(snapshot.defaultAvatar);
        setBatchSequence(snapshot.batchSequence);
        setPage(snapshot.page);
        setPageJump(String(snapshot.page));
        window.localStorage.setItem(DIGITAL_HUMAN_WORKBENCH_STORAGE_KEY, JSON.stringify(snapshot));
        window.localStorage.setItem(SELECTED_BATCH_STORAGE_KEY, snapshot.selectedBatchName);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDbStateLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [localStateLoaded]);

  useEffect(() => {
    let cancelled = false;
    if (!localStateLoaded || outputRoot !== DEFAULT_OUTPUT_ROOT) return;
    fetch("/api/digital-human/output-root")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!cancelled && data?.path) setOutputRoot(String(data.path));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [localStateLoaded, outputRoot]);

  useEffect(() => {
    if (voicesLoading || voices.length === 0) return;
    const nextVoice = voices[0]?.id || EMPTY_ASSET_ID;
    setDefaultVoice((current) => {
      if (current && current !== EMPTY_ASSET_ID && voices.some((voice) => voice.id === current)) return current;
      return nextVoice;
    });
    setRows((current) =>
      current.map((row) =>
        row.source === "audio" || row.voice === EMPTY_ASSET_ID || voices.some((voice) => voice.id === row.voice)
          ? row
          : { ...row, voice: nextVoice },
      ),
    );
  }, [voices, voicesLoading]);

  useEffect(() => {
    if (avatarsLoading || avatars.length === 0) return;
    const nextAvatar = avatars[0]?.id || EMPTY_ASSET_ID;
    setDefaultAvatar((current) => {
      if (current && current !== EMPTY_ASSET_ID && avatars.some((avatar) => avatar.id === current)) return current;
      return nextAvatar;
    });
    setRows((current) =>
      current.map((row) =>
        row.avatar === EMPTY_ASSET_ID || avatars.some((avatar) => avatar.id === row.avatar) ? row : { ...row, avatar: nextAvatar },
      ),
    );
  }, [avatars, avatarsLoading]);

  useEffect(() => {
    setPageJump(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    if (!localStateLoaded) return;
    if (restoredBatchRef.current) return;
    restoredBatchRef.current = true;
    const savedBatchName = window.localStorage.getItem(SELECTED_BATCH_STORAGE_KEY);
    if (savedBatchName && batchNames.includes(savedBatchName)) {
      setSelectedBatchName(savedBatchName);
      setPage(1);
    }
  }, [batchNames, localStateLoaded]);

  useEffect(() => {
    if (batchNames.length > 0 && !batchNames.includes(selectedBatchName)) {
      setSelectedBatchName(batchNames[0]);
    }
  }, [batchNames, selectedBatchName]);

  useEffect(() => {
    if (!localStateLoaded) return;
    if (selectedBatchName) {
      window.localStorage.setItem(SELECTED_BATCH_STORAGE_KEY, selectedBatchName);
    }
  }, [localStateLoaded, selectedBatchName]);

  useEffect(() => {
    if (!localStateLoaded) return;
    const snapshot: WorkbenchStateSnapshot = {
      rows: rows.map(serializeRow),
      selectedBatchName,
      outputRoot,
      concurrency,
      defaultVoice,
      defaultAvatar,
      batchSequence,
      page,
    };
    window.localStorage.setItem(DIGITAL_HUMAN_WORKBENCH_STORAGE_KEY, JSON.stringify(snapshot));
    if (!dbStateLoaded) return;
    const timeout = window.setTimeout(() => {
      fetch(WORKBENCH_STATE_API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: snapshot }),
      }).catch(() => {});
    }, 400);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [batchSequence, concurrency, dbStateLoaded, defaultAvatar, defaultVoice, localStateLoaded, outputRoot, page, rows, selectedBatchName]);

  const getBatchDir = useCallback((batchName: string) => joinPath(outputRoot, getLocalDateFolder(), batchName), [outputRoot]);

  const buildOutputPath = useCallback((row: ScriptRow, batchIndex: number) => {
    return joinPath(getBatchDir(row.batchName), `${String(batchIndex + 1).padStart(3, "0")}.mp4`);
  }, [getBatchDir]);

  const downloadVideoToLocal = useCallback(async (row: ScriptRow, batchIndex: number, videoUrl: string) => {
    const outputPath = buildOutputPath(row, batchIndex);
    const res = await fetch("/api/digital-human/videos/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoUrl,
        outputRoot,
        outputPath,
        batchName: row.batchName,
        filename: `${String(batchIndex + 1).padStart(3, "0")}.mp4`,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.path) throw new Error(data.error || "视频下载保存失败");
    return { outputPath: String(data.path), previewUrl: String(data.previewUrl || "") };
  }, [buildOutputPath, outputRoot]);

  const getRowBatchIndex = useCallback((rowId: string, list = rows) => {
    const target = list.find((row) => row.id === rowId);
    if (!target) return 0;
    return list.filter((row) => row.batchName === target.batchName).findIndex((row) => row.id === rowId);
  }, [rows]);

  const updateRow = useCallback((id: string, patch: Partial<ScriptRow>) => {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              ...patch,
              status:
                (patch.script !== undefined || patch.audioName !== undefined || patch.audioPath !== undefined) && row.status !== "done"
                  ? "draft"
                  : patch.status ?? row.status,
            }
          : row,
      ),
    );
  }, []);

  const addTaskRow = useCallback(() => {
    setRows((current) => {
      const batchCount = current.filter((row) => row.batchName === selectedBatchName).length;
      return [
        ...current,
        createRow(batchCount + 1, selectedBatchName, { voice: defaultVoice, avatar: defaultAvatar }),
      ];
    });
    resetPage();
  }, [defaultAvatar, defaultVoice, resetPage, selectedBatchName]);

  const chooseAudioForRow = useCallback((rowId: string) => {
    pendingAudioRowIdRef.current = rowId;
    fileInputRef.current?.click();
  }, []);

  const switchRowToScript = useCallback((row: ScriptRow) => {
    updateRow(row.id, {
      source: "script",
      script: row.script || "",
      audioName: undefined,
      audioPath: undefined,
      audioPreviewUrl: undefined,
      audioFile: undefined,
      voice: row.voice && row.voice !== EMPTY_ASSET_ID ? row.voice : defaultVoice,
    });
  }, [defaultVoice, updateRow]);

  const handleAudioSelected = useCallback((files: FileList | null) => {
    const file = files?.[0];
    const rowId = pendingAudioRowIdRef.current;
    pendingAudioRowIdRef.current = null;
    if (!file || !rowId) return;

    const filePath = window.electronAPI?.fs?.getPathForFile(file) || file.name;
    const previewUrl = URL.createObjectURL(file);
    updateRow(rowId, {
      source: "audio",
      script: "",
      audioName: file.name,
      audioPath: filePath,
      audioPreviewUrl: previewUrl,
      audioFile: file,
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [updateRow]);

  const removeRow = useCallback((id: string) => {
    setRows((current) => current.filter((row) => row.id !== id));
  }, []);

  const waitForAudio = useCallback(async (taskId: string) => {
    const start = Date.now();
    while (Date.now() - start < 180000) {
      const res = await fetch(`/api/digital-human/videos?kind=audio&taskId=${encodeURIComponent(taskId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "查询音频任务失败");
      if (isDoneStatus(data.status) && data.audioUrl) return String(data.audioUrl);
      if (isFailedStatus(data.status)) throw new Error(data.message || "音频生成失败");
      await sleep(6000);
    }
    throw new Error("音频生成超时，请稍后重试");
  }, []);

  const waitForVideo = useCallback(async (taskId: string) => {
    const start = Date.now();
    while (Date.now() - start < 600000) {
      const res = await fetch(`/api/digital-human/videos?kind=video&taskId=${encodeURIComponent(taskId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "查询视频任务失败");
      if (isDoneStatus(data.status) && data.videoUrl) {
        return { videoUrl: String(data.videoUrl), duration: Number(data.duration || 0) };
      }
      if (isFailedStatus(data.status)) throw new Error(data.message || "视频生成失败");
      await sleep(6000);
    }
    throw new Error("视频生成超时，请稍后重试");
  }, []);

  const runGenerationRow = useCallback(async (row: ScriptRow, batchIndex: number) => {
    updateRow(row.id, {
      status: "queued",
      progress: 8,
      outputPath: buildOutputPath(row, batchIndex),
      previewUrl: undefined,
      audioTaskId: undefined,
      videoTaskId: undefined,
      videoUrl: undefined,
      duration: undefined,
      error: undefined,
    });

    try {
      if (row.source === "script") {
        if (!row.voice || row.voice === EMPTY_ASSET_ID) throw new Error("请选择可用音色");
        if (!row.avatar || row.avatar === EMPTY_ASSET_ID) throw new Error("请选择可用形象");
        updateRow(row.id, { status: "voice", progress: 18 });
        const formData = new FormData();
        formData.append("source", "script");
        formData.append("title", `${row.batchName}-${String(batchIndex + 1).padStart(3, "0")}`);
        formData.append("avatar", row.avatar);
        formData.append("voice", row.voice);
        formData.append("script", row.script.trim());
        formData.append("voiceProvider", voiceProvider);
        const res = await fetch("/api/digital-human/videos", { method: "POST", body: formData });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.audioTaskId) throw new Error(data.error || "提交音频任务失败");

        updateRow(row.id, { audioTaskId: data.audioTaskId, progress: 35 });
        const audioUrl = await waitForAudio(String(data.audioTaskId));
        updateRow(row.id, { status: "video", progress: 60 });

        const videoRes = await fetch("/api/digital-human/videos", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            avatar: row.avatar,
            title: `${row.batchName}-${String(batchIndex + 1).padStart(3, "0")}`,
            audioUrl,
          }),
        });
        const videoData = await videoRes.json().catch(() => ({}));
        if (!videoRes.ok || !videoData.videoTaskId) throw new Error(videoData.error || "提交视频任务失败");

        updateRow(row.id, { videoTaskId: videoData.videoTaskId, progress: 72 });
        const result = await waitForVideo(String(videoData.videoTaskId));
        const local = await downloadVideoToLocal(row, batchIndex, result.videoUrl);
        updateRow(row.id, {
          status: "done",
          progress: 100,
          videoUrl: result.videoUrl,
          outputPath: local.outputPath,
          previewUrl: local.previewUrl,
          duration: result.duration,
        });
        return;
      }

      if (!row.audioName) throw new Error("请先选择音频文件");
      if (!row.avatar || row.avatar === EMPTY_ASSET_ID) throw new Error("请选择可用形象");
      if (!row.audioFile && !row.audioPath) {
        throw new Error("音频文件路径不存在，请重新选择后再生成。");
      }
      updateRow(row.id, { status: "video", progress: 25 });

      const formData = new FormData();
      formData.append("source", "audio");
      formData.append("title", `${row.batchName}-${String(batchIndex + 1).padStart(3, "0")}`);
      formData.append("avatar", row.avatar);
      if (row.audioFile) {
        formData.append("audio", row.audioFile);
      } else if (row.audioPath) {
        formData.append("audioPath", row.audioPath);
      }
      const res = await fetch("/api/digital-human/videos", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.videoTaskId) throw new Error(data.error || "提交视频任务失败");

      updateRow(row.id, { videoTaskId: data.videoTaskId, progress: 70 });
      const result = await waitForVideo(String(data.videoTaskId));
      const local = await downloadVideoToLocal(row, batchIndex, result.videoUrl);
      updateRow(row.id, {
        status: "done",
        progress: 100,
        videoUrl: result.videoUrl,
        outputPath: local.outputPath,
        previewUrl: local.previewUrl,
        duration: result.duration,
      });
    } catch (error) {
      updateRow(row.id, {
        status: "error",
        progress: Math.max(row.progress, 12),
        error: error instanceof Error ? error.message : "生成失败",
      });
    }
  }, [buildOutputPath, downloadVideoToLocal, updateRow, voiceProvider, waitForAudio, waitForVideo]);

  const runGenerationQueue = useCallback(async (items: ScriptRow[]) => {
    const maxConcurrency = Math.max(1, Math.min(10, Math.floor(concurrency) || DEFAULT_CONCURRENCY));
    let cursor = 0;
    const workers = Array.from({ length: Math.min(maxConcurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor];
        cursor += 1;
        await runGenerationRow(item, getRowBatchIndex(item.id));
      }
    });
    await Promise.all(workers);
  }, [concurrency, getRowBatchIndex, runGenerationRow]);

  const startGeneration = useCallback(() => {
    if (runnableRows.length === 0) {
      showToast({ type: "info", message: "当前筛选结果没有可生成的任务" });
      return;
    }
    setGenerateConfirmOpen(false);
    runGenerationQueue(runnableRows).then(() => {
      showToast({ type: "success", message: "当前批次生成任务已处理完成" });
    }).catch((error) => {
      showToast({ type: "error", message: error instanceof Error ? error.message : "批量生成失败" });
    });
  }, [runGenerationQueue, runnableRows]);

  const retryRow = useCallback((id: string) => {
    const target = rows.find((row) => row.id === id);
    if (!target) return;
    runGenerationRow(target, Math.max(getRowBatchIndex(id), 0));
  }, [getRowBatchIndex, rows, runGenerationRow]);

  const openRowFolder = useCallback(async (row: ScriptRow) => {
    if (!row.outputPath) return;
    const folderPath = row.outputPath.replace(/[\\/][^\\/]+$/, "");
    if (window.electronAPI?.shell?.openPath) {
      const error = await window.electronAPI.shell.openPath(folderPath);
      if (error) showToast({ type: "error", message: `无法打开目录：${error}` });
      return;
    }
    showToast({ type: "info", message: `视频目录：${folderPath}` });
  }, []);

  const saveSettings = useCallback(() => {
    const normalizedOutputRoot = outputRoot.trim() || DEFAULT_OUTPUT_ROOT;
    setOutputRoot(normalizedOutputRoot);
    setConcurrency((value) => Math.max(1, Math.min(10, Math.floor(value) || DEFAULT_CONCURRENCY)));
    setSettingsOpen(false);
    showToast({ type: "success", message: "生成设置已保存" });
  }, [outputRoot]);

  const chooseOutputRoot = useCallback(async () => {
    if (!window.electronAPI?.dialog?.openFolder) return;
    const result = await window.electronAPI.dialog.openFolder({
      defaultPath: outputRoot || undefined,
      title: "选择数字人视频输出目录",
    });
    if (!result.canceled && result.filePaths[0]) {
      setOutputRoot(result.filePaths[0]);
    }
  }, [outputRoot]);

  const startNewBatch = useCallback(() => {
    const nextSequence = batchSequence + 1;
    const nextName = createBatchName(nextSequence);
    setBatchSequence(nextSequence);
    setSelectedBatchName(nextName);
    setRows((current) => [
      createRow(1, nextName, { voice: defaultVoice, avatar: defaultAvatar }),
      ...current,
    ]);
    resetPage();
  }, [batchSequence, defaultAvatar, defaultVoice, resetPage]);

  const jumpToPage = useCallback(() => {
    const value = Number(pageJump);
    if (!Number.isFinite(value)) {
      setPageJump(String(currentPage));
      return;
    }
    const nextPage = Math.max(1, Math.min(totalPages, Math.floor(value)));
    setPage(nextPage);
    setPageJump(String(nextPage));
  }, [currentPage, pageJump, totalPages]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <input
        ref={fileInputRef}
        type="file"
        id="digital-human-row-audio"
        name="digital-human-row-audio"
        accept="audio/*"
        className="hidden"
        onChange={(event) => handleAudioSelected(event.target.files)}
      />
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>生成设置</DialogTitle>
            <DialogDescription>
              配置批量生成的本地输出位置和同时处理的任务数量。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="digital-human-output-root">输出目录</Label>
              <div className="flex items-start gap-2">
                <Textarea
                  id="digital-human-output-root"
                  value={outputRoot}
                  onChange={(event) => setOutputRoot(event.target.value)}
                  className="min-h-16 resize-y break-all font-mono text-xs leading-relaxed"
                  placeholder="results"
                />
                <Button type="button" variant="outline" onClick={chooseOutputRoot}>
                  选择
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="digital-human-concurrency">并发数量</Label>
              <Input
                id="digital-human-concurrency"
                type="number"
                min={1}
                max={10}
                value={concurrency}
                onChange={(event) => setConcurrency(Number(event.target.value))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>取消</Button>
            <Button onClick={saveSettings}>保存设置</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={generateConfirmOpen} onOpenChange={setGenerateConfirmOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>确认开始生成</DialogTitle>
            <DialogDescription>
              将生成当前筛选结果中可执行且未完成的 {runnableRows.length} 条任务，已完成任务会自动跳过。
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
            当前筛选结果共 {filteredRows.length} 条，分页只影响展示，不影响本次生成范围。
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateConfirmOpen(false)}>取消</Button>
            <Button disabled={runnableRows.length === 0} onClick={startGeneration}>
              确认生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!previewRow} onOpenChange={(open) => { if (!open) setPreviewRow(null); }}>
        <DialogContent className="sm:max-w-[860px]">
          <DialogHeader>
            <DialogTitle>预览视频</DialogTitle>
          </DialogHeader>
          {previewRow?.previewUrl ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={previewRow.previewUrl} controls autoPlay className="max-h-[70vh] w-full rounded-md bg-black" />
          ) : (
            <div className="rounded-md border border-border/70 bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
              这个任务还没有可预览的本地视频。
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="shrink-0 border-b border-border/50 px-6 pb-4 pt-4">
        <h1 className="text-xl font-semibold">
          数字人批量生成
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          批量管理文案和音频任务，按批次筛选、生成和重试。
        </p>
      </div>

      <div className="grid shrink-0 grid-cols-4 gap-3 border-b border-border/60 px-6 py-3 max-lg:grid-cols-2">
        <StatTile label="可生成" value={stats.ready} icon={RowsPlusBottom} />
        <StatTile label="生成中" value={stats.running} icon={SpinnerGap} active={stats.running > 0} />
        <StatTile label="已完成" value={stats.done} icon={CheckCircle} />
        <StatTile label="失败" value={stats.failed} icon={WarningCircle} />
      </div>

      <div className="grid shrink-0 gap-3 border-b border-border/60 px-6 py-4">
        <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
          <Field label="默认音色">
            <Select value={defaultVoice} onValueChange={setDefaultVoice} disabled={voicesLoading || voices.length === 0}>
              <SelectTrigger className="w-full">
                <VoiceNameSelectValue voice={voices.find((voice) => voice.id === defaultVoice)} loading={voicesLoading} />
              </SelectTrigger>
              <SelectContent>
                {voices.length === 0 ? (
                  <SelectItem value={EMPTY_ASSET_ID} disabled>
                    {voicesLoading ? "同步音色..." : "暂无可用音色"}
                  </SelectItem>
                ) : voices.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>{voice.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="默认形象">
            <Select value={defaultAvatar} onValueChange={setDefaultAvatar} disabled={avatarsLoading || avatars.length === 0}>
              <SelectTrigger className="w-full">
                <AvatarSelectValue avatar={avatars.find((avatar) => avatar.id === defaultAvatar)} loading={avatarsLoading} />
              </SelectTrigger>
              <SelectContent>
                {avatars.length === 0 ? (
                  <SelectItem value={EMPTY_ASSET_ID} disabled>
                    {avatarsLoading ? "同步形象..." : "暂无可用形象"}
                  </SelectItem>
                ) : avatars.map((avatar) => (
                  <SelectItem key={avatar.id} value={avatar.id}>
                    <AvatarOption avatar={avatar} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-b border-border/60 px-6 py-3">
        <div className="grid flex-1 grid-cols-[180px_150px_minmax(220px,1fr)] gap-3 max-xl:grid-cols-2 max-md:grid-cols-1">
          <Field label="批次">
            <Select value={selectedBatchName} onValueChange={(value) => { setSelectedBatchName(value); resetPage(); }}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {batchNames.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="状态筛选">
          <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value as StatusFilter); resetPage(); }}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="draft">草稿</SelectItem>
              <SelectItem value="running">生成中</SelectItem>
              <SelectItem value="done">已完成</SelectItem>
              <SelectItem value="error">失败</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="搜索">
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="digital-human-search"
              name="digital-human-search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); resetPage(); }}
              className="pl-8"
              placeholder="搜索文案、音频、批次"
            />
          </div>
        </Field>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={addTaskRow}>
            <Plus size={14} />
            添加一行
          </Button>
          <Button variant="outline" size="sm" onClick={startNewBatch}>
            <FilePlus size={14} />
            新建批次
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Gear size={14} />
            设置
          </Button>
          <Button size="sm" onClick={() => setGenerateConfirmOpen(true)}>
            <Play size={14} weight="fill" />
            开始生成
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        <div className="min-w-[1040px] overflow-hidden rounded-lg border border-border/70 bg-card">
          <div className={cn("grid border-b border-border/60 bg-muted/45 px-3 py-2 text-xs font-medium text-muted-foreground", TABLE_GRID_COLUMNS)}>
            <div>#</div>
            <div>批次</div>
            <div>文案 / 音频</div>
            <div>音色</div>
            <div>数字人形象</div>
            <div>状态</div>
            <div>操作</div>
          </div>
          <div className="divide-y divide-border/60">
            {pageRows.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">没有匹配的任务。</div>
            ) : (
              pageRows.map((row, index) => (
                <div
                  key={row.id}
                  className={cn("grid w-full items-start px-3 py-3 text-left transition-colors hover:bg-accent/35", TABLE_GRID_COLUMNS)}
                >
                  <div className="pt-2 text-xs text-muted-foreground">{String((currentPage - 1) * DEFAULT_PAGE_SIZE + index + 1).padStart(2, "0")}</div>
                  <div className="pt-2 text-xs font-medium">{row.batchName}</div>
                  <div className="pr-3">
                    {row.source === "audio" ? (
                      <AudioCell row={row} onChoose={() => chooseAudioForRow(row.id)} onUseScript={() => switchRowToScript(row)} />
                    ) : (
                      <div className="space-y-2">
                        <Textarea
                          id={`digital-human-script-${row.id}`}
                          name="digital-human-script"
                          value={row.script}
                          onChange={(event) => updateRow(row.id, { script: event.target.value })}
                          className="h-20 min-h-20 resize-none overflow-y-auto border-transparent bg-transparent px-2 shadow-none hover:border-border focus-visible:border-ring"
                          placeholder="输入这条视频的口播文案..."
                        />
                        <Button variant="ghost" size="xs" onClick={() => chooseAudioForRow(row.id)}>
                          <UploadSimple size={12} />
                          改用音频
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="pr-3 pt-1">
                    <Select
                      value={row.voice}
                      disabled={row.source === "audio" || voicesLoading || voices.length === 0}
                      onValueChange={(value) => updateRow(row.id, { voice: value })}
                    >
                      <SelectTrigger className="w-full">
                        <VoiceNameSelectValue voice={voices.find((voice) => voice.id === row.voice)} loading={voicesLoading} />
                      </SelectTrigger>
                      <SelectContent>
                        {voices.length === 0 ? (
                          <SelectItem value={EMPTY_ASSET_ID} disabled>
                            {voicesLoading ? "同步音色..." : "暂无可用音色"}
                          </SelectItem>
                        ) : voices.map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>{voice.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="pr-3 pt-1">
                    <Select
                      value={row.avatar}
                      disabled={avatarsLoading || avatars.length === 0}
                      onValueChange={(value) => updateRow(row.id, { avatar: value })}
                    >
                      <SelectTrigger className="w-full">
                        <AvatarSelectValue avatar={avatars.find((avatar) => avatar.id === row.avatar)} loading={avatarsLoading} />
                      </SelectTrigger>
                      <SelectContent>
                        {avatars.length === 0 ? (
                          <SelectItem value={EMPTY_ASSET_ID} disabled>
                            {avatarsLoading ? "同步形象..." : "暂无可用形象"}
                          </SelectItem>
                        ) : avatars.map((avatar) => (
                          <SelectItem key={avatar.id} value={avatar.id}>
                            <AvatarOption avatar={avatar} />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="pt-1">
                    <StatusBadge status={row.status} />
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${row.progress}%` }} />
                    </div>
                    {row.error && <p className="mt-1 line-clamp-2 text-xs text-status-error-foreground">{row.error}</p>}
                    {row.duration ? <p className="mt-1 text-xs text-muted-foreground">{row.duration} 秒</p> : null}
                  </div>
                  <div className="flex justify-start gap-1 pt-1">
                    {row.status === "done" && row.previewUrl && (
                      <Button variant="ghost" size="icon-sm" onClick={() => setPreviewRow(row)}>
                        <VideoCamera size={14} />
                        <span className="sr-only">预览视频</span>
                      </Button>
                    )}
                    {row.outputPath && (
                      <Button variant="ghost" size="icon-sm" onClick={() => openRowFolder(row)}>
                        <FolderOpen size={14} />
                        <span className="sr-only">打开目录</span>
                      </Button>
                    )}
                    {row.status === "error" && (
                      <Button variant="ghost" size="icon-sm" onClick={() => retryRow(row.id)}>
                        <Play size={14} />
                        <span className="sr-only">重试</span>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" onClick={() => removeRow(row.id)}>
                      <Trash size={14} />
                      <span className="sr-only">删除</span>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <div>
            共 {filteredRows.length} 条，每页 10 条，第 {currentPage} / {totalPages} 页
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon-sm" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              <CaretLeft size={14} />
              <span className="sr-only">上一页</span>
            </Button>
            <Input
              id="digital-human-page-jump"
              name="digital-human-page-jump"
              type="number"
              min={1}
              max={totalPages}
              value={pageJump}
              onChange={(event) => setPageJump(event.target.value)}
              onBlur={jumpToPage}
              onKeyDown={(event) => {
                if (event.key === "Enter") jumpToPage();
              }}
              className="h-8 w-16 text-center"
              aria-label="跳转页码"
            />
            <Button variant="outline" size="icon-sm" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
              <CaretRight size={14} />
              <span className="sr-only">下一页</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AudioCell({ row, onChoose, onUseScript }: { row: ScriptRow; onChoose: () => void; onUseScript: () => void }) {
  return (
    <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <FileAudio size={15} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{row.audioName || "未选择音频"}</span>
        <Button variant="ghost" size="xs" onClick={onChoose}>
          更换
        </Button>
        <Button variant="ghost" size="xs" onClick={onUseScript}>
          <PencilSimple size={12} />
          文案
        </Button>
      </div>
      <audio controls src={row.audioPreviewUrl || undefined} className="mt-2 h-8 w-full" />
    </div>
  );
}

function VoiceNameSelectValue({ voice, loading }: { voice?: WorkbenchVoice; loading?: boolean }) {
  if (loading && !voice) {
    return (
      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <SpinnerGap size={14} className="animate-spin" />
        同步音色...
      </span>
    );
  }

  return <span className={cn("min-w-0 truncate", !voice && "text-muted-foreground")}>{voice?.name || "暂无可用音色"}</span>;
}

function AvatarOption({ avatar }: { avatar: WorkbenchAvatar }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <AvatarThumb avatar={avatar} />
      <span className="min-w-0 truncate">{avatar.name}</span>
    </span>
  );
}

function AvatarSelectValue({ avatar, loading }: { avatar?: WorkbenchAvatar; loading?: boolean }) {
  if (loading && !avatar) {
    return (
      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <SpinnerGap size={14} className="animate-spin" />
        同步形象...
      </span>
    );
  }

  if (!avatar) {
    return <span className="text-muted-foreground">选择形象</span>;
  }

  return <AvatarOption avatar={avatar} />;
}

function AvatarThumb({ avatar }: { avatar: WorkbenchAvatar }) {
  return (
    <span className="block size-7 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatar.coverImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function StatTile({ label, value, icon: Icon, active }: { label: string; value: number; icon: typeof Clock; active?: boolean }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon size={16} className={cn("text-muted-foreground", active && "animate-spin text-primary")} />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: JobStatus }) {
  const meta = statusMeta[status];
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs", meta.className)}>
      <Icon size={12} className={status === "voice" || status === "video" ? "animate-pulse" : undefined} />
      {meta.label}
    </span>
  );
}
