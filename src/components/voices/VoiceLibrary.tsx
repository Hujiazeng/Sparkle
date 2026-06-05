"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  CheckCircle,
  Gear,
  Play,
  Plus,
  Sparkle,
  SpinnerGap,
  SlidersHorizontal,
  UploadSimple,
  WarningCircle,
  Waveform,
  X,
} from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { showToast } from "@/hooks/useToast";
import { VoiceAvatar } from "@/components/voices/VoiceAvatar";
import { refreshDigitalHumanAssets } from "@/lib/digital-human-assets-cache";

type VoiceStatus = "ready" | "training" | "failed";
type KindFilter = "mine" | "public" | "all";
type SortOrder = "newest" | "oldest";
type VoiceProvider = "skyhuman" | "indextts";

interface VoiceItem {
  id: string;
  voice: string;
  title: string;
  type: string;
  rate: string;
  volume: string;
  pitch: string;
  demoUrl: string;
  language: string;
  kind: number;
  status: VoiceStatus;
  createdAt: string;
  taskId?: string;
  provider?: VoiceProvider;
}

const PAGE_SIZE = 24;
const statusMeta: Record<VoiceStatus, { label: string; icon: typeof CheckCircle; className: string }> = {
  ready: {
    label: "可用",
    icon: CheckCircle,
    className: "border-status-success-border bg-status-success-muted text-status-success-foreground",
  },
  training: {
    label: "克隆中",
    icon: SpinnerGap,
    className: "border-status-info-border bg-status-info-muted text-status-info-foreground",
  },
  failed: {
    label: "失败",
    icon: WarningCircle,
    className: "border-status-error-border bg-status-error-muted text-status-error-foreground",
  },
};

function normalizeStatus(status: unknown): VoiceStatus {
  const value = String(status || "").toLowerCase();
  if (["failed", "fail", "error", "cancelled", "canceled"].includes(value) || value === "4") return "failed";
  if (["ready", "success", "succeeded", "done", "completed", "finish", "finished", "3"].includes(value)) return "ready";
  return value ? "training" : "ready";
}

function normalizeVoice(raw: Record<string, unknown>): VoiceItem {
  return {
    id: String(raw.id ?? raw.voice ?? crypto.randomUUID()),
    voice: String(raw.voice ?? ""),
    title: String(raw.title || "未命名音色"),
    type: String(raw.type ?? ""),
    rate: String(raw.rate ?? "1.0"),
    volume: String(raw.volume ?? "1.0"),
    pitch: String(raw.pitch ?? "1.0"),
    demoUrl: String(raw.demoUrl ?? raw.demo_url ?? raw.audioUrl ?? raw.audio_url ?? ""),
    language: String(raw.language ?? ""),
    kind: Number(raw.kind ?? 1) === 2 ? 2 : 1,
    status: normalizeStatus(raw.status),
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
    provider: raw.provider === "indextts" ? "indextts" : "skyhuman",
  };
}

function createPendingVoice(title: string, taskId: string): VoiceItem {
  return {
    id: `task-${taskId}`,
    voice: "",
    title: title.trim() || "未命名音色",
    type: "8",
    rate: "1.0",
    volume: "1.0",
    pitch: "1.0",
    demoUrl: "",
    language: "",
    kind: 1,
    status: "training",
    createdAt: new Date().toISOString().slice(0, 10),
    taskId,
  };
}

export function VoiceLibrary() {
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("mine");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [page, setPage] = useState(1);
  const [pageJump, setPageJump] = useState("1");
  const [selectedVoice, setSelectedVoice] = useState<VoiceItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
  const [selectedAudioName, setSelectedAudioName] = useState("");
  const [selectedAudioUrl, setSelectedAudioUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [ttsText, setTtsText] = useState("你好，这是一段试听文本，用来检查音色、语速和语调。");
  const [ttsLoading, setTtsLoading] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false);
  const [provider, setProvider] = useState<VoiceProvider>("skyhuman");
  const [providerLoaded, setProviderLoaded] = useState(false);

  const fetchVoices = useCallback(async (filter: KindFilter, activeProvider: VoiceProvider) => {
    setLoading(true);
    setLoadError("");
    try {
      const kind = filter === "public" ? 2 : 1;
      const res = await fetch(`/api/voices?provider=${encodeURIComponent(activeProvider)}&kind=${kind}&page=1&size=300`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "获取音色列表失败");
      }
      setConfigured(data.configured !== false);
      setVoices(Array.isArray(data.voices) ? data.voices.map(normalizeVoice) : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "获取音色列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/voices/provider", { cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        const nextProvider = data?.provider === "indextts" ? "indextts" : "skyhuman";
        setProvider(nextProvider);
        setProviderLoaded(true);
        return fetchVoices(kindFilter, nextProvider);
      })
      .catch(() => {
        setProviderLoaded(true);
        fetchVoices(kindFilter, "skyhuman");
      });
  }, [fetchVoices, kindFilter]);

  const handleProviderChange = useCallback(async (nextProvider: VoiceProvider) => {
    if (nextProvider === provider) return;
    setProvider(nextProvider);
    setSelectedVoice(null);
    setDetailOpen(false);
    setKindFilter("mine");
    try {
      const res = await fetch("/api/voices/provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: nextProvider }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "保存默认语音服务失败");
      await fetchVoices("mine", nextProvider);
      await refreshDigitalHumanAssets("voices");
      showToast({ type: "success", message: `默认语音服务已切换为 ${nextProvider === "indextts" ? "IndexTTS" : "SkyHuman"}` });
    } catch (error) {
      showToast({ type: "error", message: error instanceof Error ? error.message : "切换语音服务失败" });
    }
  }, [fetchVoices, provider]);

  useEffect(() => {
    const handler = () => fetchVoices(kindFilter, provider);
    window.addEventListener("digital-human-settings-changed", handler);
    return () => window.removeEventListener("digital-human-settings-changed", handler);
  }, [fetchVoices, kindFilter, provider]);

  useEffect(() => {
    if (provider !== "skyhuman") return;
    const pending = voices.filter((voice) => voice.status === "training" && voice.taskId);
    if (pending.length === 0) return;

    const timer = window.setInterval(() => {
      pending.forEach(async (item) => {
        try {
          const res = await fetch(`/api/voices/task?taskId=${encodeURIComponent(item.taskId || "")}`);
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "查询音色任务失败");

          const nextStatus = normalizeStatus(data.status);
          if (nextStatus === "training") return;

          if (nextStatus === "ready") {
            await fetchVoices(kindFilter, provider);
            await refreshDigitalHumanAssets("voices");
            showToast({ type: "success", message: "音色创建完成" });
            return;
          }

          setVoices((current) =>
            current.map((voice) =>
              voice.taskId === item.taskId
                ? { ...voice, status: "failed", demoUrl: "", title: voice.title }
                : voice,
            ),
          );
          setSelectedVoice((current) => {
            if (!current || current.taskId !== item.taskId) return current;
            return { ...current, status: "failed", demoUrl: "" };
          });
        } catch (error) {
          console.error("[voice] task poll failed", error);
        }
      });
    }, 6000);

    return () => window.clearInterval(timer);
  }, [fetchVoices, provider, voices]);

  const filteredVoices = useMemo(() => {
    return voices.filter((voice) => {
      if (kindFilter === "mine" && voice.kind === 2) return false;
      if (kindFilter === "public" && voice.kind !== 2) return false;
      return true;
    }).sort((a, b) => {
      const result = a.createdAt.localeCompare(b.createdAt);
      return sort === "oldest" ? result : -result;
    });
  }, [voices, kindFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredVoices.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filteredVoices.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [currentPage, filteredVoices],
  );

  useEffect(() => {
    setPage(1);
  }, [kindFilter, sort]);

  useEffect(() => {
    setPageJump(String(currentPage));
  }, [currentPage]);

  const resetCreateForm = useCallback((revokeAudioUrl = true) => {
    if (revokeAudioUrl && selectedAudioUrl) {
      URL.revokeObjectURL(selectedAudioUrl);
    }
    setNewTitle("");
    setSelectedAudioFile(null);
    setSelectedAudioName("");
    setSelectedAudioUrl("");
    if (audioInputRef.current) audioInputRef.current.value = "";
  }, [selectedAudioUrl]);

  const handleAudioSelected = useCallback((files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (selectedAudioUrl) {
      URL.revokeObjectURL(selectedAudioUrl);
    }
    setSelectedAudioFile(file);
    setSelectedAudioName(file.name);
    setSelectedAudioUrl(URL.createObjectURL(file));
  }, [selectedAudioUrl]);

  const handleCreate = useCallback(async () => {
    if (!selectedAudioFile) {
      showToast({ type: "warning", message: "请先选择参考音频" });
      return;
    }

    setCreating(true);
    try {
      const formData = new FormData();
      formData.append("title", newTitle.trim() || "未命名音色");
      formData.append("audio", selectedAudioFile);
      const res = await fetch(`/api/voices?provider=${provider}`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (!data.taskId && !data.voice)) {
        throw new Error(data.error || "提交音色创建任务失败");
      }

      if (data.voice) {
        const item = normalizeVoice(data.voice);
        setVoices((current) => [item, ...current]);
        setSelectedVoice(item);
        await refreshDigitalHumanAssets("voices");
        showToast({ type: "success", message: "音色创建完成" });
      } else {
        const item = createPendingVoice(newTitle, data.taskId);
        setVoices((current) => [item, ...current]);
        setSelectedVoice(item);
        showToast({ type: "success", message: "音色创建任务已提交" });
      }
      setCreateOpen(false);
      setDetailOpen(true);
      resetCreateForm();
    } catch (error) {
      showToast({ type: "error", message: error instanceof Error ? error.message : "提交音色创建任务失败" });
    } finally {
      setCreating(false);
    }
  }, [newTitle, provider, resetCreateForm, selectedAudioFile]);

  const handleSelect = useCallback((voice: VoiceItem) => {
    setSelectedVoice(voice);
    setDetailOpen(true);
  }, []);

  const handleDeleteLocal = useCallback(async (voice: VoiceItem) => {
    if (provider === "indextts") {
      try {
        const res = await fetch(`/api/voices/delete?provider=indextts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceId: voice.voice || voice.id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "删除音色失败");
        await refreshDigitalHumanAssets("voices");
        showToast({ type: "success", message: "音色已删除" });
      } catch (error) {
        showToast({ type: "error", message: error instanceof Error ? error.message : "删除音色失败" });
        return;
      }
    }
    setVoices((current) => current.filter((item) => item.id !== voice.id));
    setDetailOpen(false);
    setSelectedVoice(null);
  }, [provider]);

  const handleSync = useCallback(async () => {
    await fetchVoices(kindFilter, provider);
    await refreshDigitalHumanAssets("voices");
  }, [fetchVoices, kindFilter, provider]);

  const handleGenerateTtsPreview = useCallback(async () => {
    if (!selectedVoice || !selectedVoice.voice) return;
    if (!ttsText.trim()) {
      showToast({ type: "warning", message: "请输入试听文本" });
      return;
    }

    setTtsLoading(true);
    try {
      const res = await fetch(`/api/voices/tts?provider=${provider}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: selectedVoice.voice, text: ttsText.trim(), title: `${selectedVoice.title} 试听` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.taskId) {
        throw new Error(data.error || "提交试听任务失败");
      }

      const start = Date.now();
      while (Date.now() - start < 180000) {
        const taskRes = await fetch(`/api/voices/tts?provider=${provider}&taskId=${encodeURIComponent(data.taskId)}`);
        const taskData = await taskRes.json().catch(() => ({}));
        if (!taskRes.ok) throw new Error(taskData.error || "查询试听任务失败");
        if (taskData.status === 3 && taskData.audioUrl) {
          const audio = new Audio(taskData.audioUrl);
          await audio.play().catch(() => {});
          showToast({ type: "success", message: "试听音频已生成" });
          return;
        }
        if (taskData.status === 4) {
          throw new Error(taskData.message || "试听音频生成失败");
        }
        await new Promise((resolve) => window.setTimeout(resolve, 6000));
      }
      throw new Error("试听音频生成超时，请稍后重试");
    } catch (error) {
      showToast({ type: "error", message: error instanceof Error ? error.message : "试听失败" });
    } finally {
      setTtsLoading(false);
    }
  }, [provider, selectedVoice, ttsText]);

  const handleSaveVoice = useCallback(async () => {
    if (!selectedVoice || !selectedVoice.voice || provider === "indextts") return;
    setSavingVoice(true);
    try {
      const res = await fetch("/api/voices/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice: selectedVoice.voice,
          title: selectedVoice.title,
          rate: selectedVoice.rate,
          volume: selectedVoice.volume,
          pitch: selectedVoice.pitch,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "保存音色参数失败");
      setVoices((current) => current.map((voice) => voice.id === selectedVoice.id ? selectedVoice : voice));
      showToast({ type: "success", message: "音色参数已保存" });
    } catch (error) {
      showToast({ type: "error", message: error instanceof Error ? error.message : "保存音色参数失败" });
    } finally {
      setSavingVoice(false);
    }
  }, [provider, selectedVoice]);

  const clearFilters = useCallback(() => {
    setKindFilter("mine");
    setSort("newest");
  }, []);

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

  const hasActiveFilters = kindFilter !== "mine" || sort !== "newest";
  const providerLabel = provider === "indextts" ? "IndexTTS" : "SkyHuman";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <input
        ref={audioInputRef}
        type="file"
        id="voice-audio-input"
        name="voice-audio-input"
        accept="audio/*"
        className="hidden"
        onChange={(event) => handleAudioSelected(event.target.files)}
      />

      <div className="shrink-0 border-b border-border/50 px-6 pb-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">音色管理</h1>
            <p className="mt-1 text-sm text-muted-foreground">管理可复用的声音资产，当前默认语音服务：{providerLabel}。</p>
          </div>
          <Button size="sm" className="gap-1" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
            创建音色
          </Button>
        </div>
      </div>

      <div className="grid shrink-0 gap-4 border-b border-border/60 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant={provider === "skyhuman" ? "secondary" : "ghost"} size="sm" onClick={() => handleProviderChange("skyhuman")} disabled={!providerLoaded}>
              SkyHuman
            </Button>
            <Button variant={provider === "indextts" ? "secondary" : "ghost"} size="sm" onClick={() => handleProviderChange("indextts")} disabled={!providerLoaded}>
              IndexTTS
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <Button variant={kindFilter === "mine" ? "secondary" : "ghost"} size="sm" onClick={() => setKindFilter("mine")}>
              <SlidersHorizontal size={14} />
              我的音色
            </Button>
            <Button variant={kindFilter === "public" ? "secondary" : "ghost"} size="sm" onClick={() => setKindFilter("public")} disabled={provider === "indextts"}>
              <SlidersHorizontal size={14} />
              公共音色
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSort((value) => (value === "newest" ? "oldest" : "newest"))}>
              <ArrowClockwise size={14} />
              {sort === "newest" ? "最新优先" : "最早优先"}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                清除筛选
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleSync}>
              <ArrowClockwise size={14} className={loading ? "animate-spin" : undefined} />
              同步
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <CenteredState icon={SpinnerGap} label="正在加载音色..." spin />
        ) : !configured ? (
          <CenteredState
            icon={Gear}
            label={provider === "indextts" ? "请先配置 IndexTTS 云端服务" : "请先配置数字人 API Token"}
            hint={provider === "indextts" ? "当前语音服务暂不可用，请联系管理员处理。" : "音色与数字人共用同一套 SkyHuman 凭证。"}
            action={<Button size="sm" onClick={() => { window.location.href = "/settings#digital-human"; }}>前往设置</Button>}
          />
        ) : loadError ? (
          <CenteredState
            icon={WarningCircle}
            label={loadError}
            action={<Button size="sm" variant="outline" onClick={handleSync}><ArrowClockwise size={14} />重新同步</Button>}
          />
        ) : filteredVoices.length === 0 ? (
          <CenteredState
            icon={Sparkle}
            label="暂无音色"
            hint={provider === "indextts" ? "上传参考音频后会出现在这里。" : "创建参考音频后会出现在这里，也可以切换到公共音色查看。"}
          />
        ) : (
          <>
            <div className="grid gap-3 xl:grid-cols-2">
              {pageItems.map((voice) => (
                <VoiceCard
                  key={voice.id}
                  voice={voice}
                  onSelect={handleSelect}
                />
              ))}
            </div>
            <PaginationBar
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredVoices.length}
              pageJump={pageJump}
              onPageJumpChange={setPageJump}
              onJump={jumpToPage}
              onPrevious={() => setPage((value) => Math.max(1, value - 1))}
              onNext={() => setPage((value) => Math.min(totalPages, value + 1))}
            />
          </>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>创建音色</DialogTitle>
            <DialogDescription>上传参考音频并提交创建任务，完成后可在详情里生成试听。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="voice-title">名称</Label>
              <Input id="voice-title" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="例如：沉稳主持音色" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="voice-audio">参考音频</Label>
              <Button type="button" variant="outline" className="w-full justify-start" onClick={() => audioInputRef.current?.click()}>
                <UploadSimple size={14} />
                {selectedAudioName || "选择本地音频"}
              </Button>
              {selectedAudioUrl && (
                <audio controls src={selectedAudioUrl} className="mt-1 w-full" />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); resetCreateForm(); }}>取消</Button>
            <Button onClick={handleCreate} disabled={!selectedAudioFile || creating}>
              {creating && <SpinnerGap size={14} className="animate-spin" />}
              提交
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>音色详情</DialogTitle>
            <DialogDescription>查看音色参数并生成一段试听音频。</DialogDescription>
          </DialogHeader>
          {selectedVoice && (
            <div className="grid gap-5 md:grid-cols-[280px_1fr]">
              <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/20 p-4">
                <VoicePreview voice={selectedVoice} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{selectedVoice.title}</h2>
                  <VoiceStatusBadge status={selectedVoice.status} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">配置语速、音量和语调后可生成一段试听音频。</p>
                <Separator className="my-5" />
                <div className="grid gap-3">
                  <div className="rounded-lg border border-border/70 bg-muted/25 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="voice-tts-text" className="text-xs text-muted-foreground">试听参数</Label>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <Field label="语速">
                        <Input
                          value={selectedVoice.rate}
                          onChange={(event) => setSelectedVoice((current) => current ? { ...current, rate: event.target.value } : current)}
                        />
                      </Field>
                      <Field label="音量">
                        <Input
                          value={selectedVoice.volume}
                          onChange={(event) => setSelectedVoice((current) => current ? { ...current, volume: event.target.value } : current)}
                        />
                      </Field>
                      <Field label="语调">
                        <Input
                          value={selectedVoice.pitch}
                          onChange={(event) => setSelectedVoice((current) => current ? { ...current, pitch: event.target.value } : current)}
                        />
                      </Field>
                    </div>
                    <Label htmlFor="voice-tts-text" className="mt-4 text-xs text-muted-foreground">试听文本</Label>
                    <Textarea
                      id="voice-tts-text"
                      name="voice-tts-text"
                      value={ttsText}
                      onChange={(event) => setTtsText(event.target.value)}
                      className="mt-2 min-h-28"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleGenerateTtsPreview} disabled={ttsLoading || !selectedVoice.voice}>
                      {ttsLoading && <SpinnerGap size={14} className="animate-spin" />}
                      <Play size={14} />
                      生成试听
                    </Button>
                    <Button variant="outline" onClick={handleSaveVoice} disabled={savingVoice || !selectedVoice.voice || provider === "indextts"}>
                      {savingVoice && <SpinnerGap size={14} className="animate-spin" />}
                      <Gear size={14} />
                      保存参数
                    </Button>
                    <Button variant="ghost" onClick={() => handleDeleteLocal(selectedVoice)}>
                      <X size={14} />
                      {provider === "indextts" ? "删除音色" : "移除本地项"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VoiceCard({
  voice,
  onSelect,
}: {
  voice: VoiceItem;
  onSelect: (voice: VoiceItem) => void;
}) {
  return (
    <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <VoiceAvatar name={voice.title} />
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{voice.title}</CardTitle>
              <CardDescription className="mt-1 truncate text-xs">
                {voice.kind === 2 ? "公共音色" : "我的音色"}
              </CardDescription>
            </div>
          </div>
          <VoiceStatusBadge status={voice.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-4 py-4">
        <VoiceWave voice={voice} />
        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
          <MetricChip label="语速" value={voice.rate} />
          <MetricChip label="音量" value={voice.volume} />
          <MetricChip label="语调" value={voice.pitch} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Waveform size={14} className={cn(voice.status === "training" && "animate-spin")} />
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onSelect(voice)}>
              <Sparkle size={14} />
              详情
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function VoicePreview({ voice }: { voice: VoiceItem }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-card p-4">
        <VoiceAvatar name={voice.title} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{voice.title}</p>
          <p className="text-xs text-muted-foreground">{voice.voice ? "已同步音色" : "任务处理中"}</p>
        </div>
      </div>
      <div className="rounded-lg border border-border/70 bg-card p-4">
        <VoiceWave voice={voice} large />
      </div>
      <div className="grid gap-2 text-sm text-muted-foreground">
        <MetaRow label="类型" value={voice.type || "8"} />
        <MetaRow label="创建时间" value={voice.createdAt || "未知"} />
      </div>
    </div>
  );
}

function VoiceWave({ voice, large = false }: { voice: VoiceItem; large?: boolean }) {
  const seed = voice.voice || voice.title;
  const bars = useMemo(() => {
    const values = [];
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i)) % 97;
    }
    for (let index = 0; index < (large ? 16 : 12); index += 1) {
      const height = 18 + ((hash + index * 13) % 52);
      values.push(height);
    }
    return values;
  }, [large, seed]);

  return (
    <div className={cn("flex items-end gap-1 rounded-lg border border-border/70 bg-muted/25 px-3 py-4", large ? "h-32" : "h-24")}>
      {bars.map((height, index) => (
        <span
          key={`${seed}-${index}`}
          className={cn("block flex-1 rounded-full bg-primary/70", voice.status === "training" && "animate-pulse")}
          style={{ height: `${height}%`, minHeight: large ? 18 : 12 }}
        />
      ))}
    </div>
  );
}

function VoiceStatusBadge({ status }: { status: VoiceStatus }) {
  const meta = statusMeta[status];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 rounded-md px-2 py-1 text-[11px]", meta.className)}>
      <Icon size={11} className={status === "training" ? "animate-spin" : undefined} />
      {meta.label}
    </Badge>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-background px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs font-medium">{value}</p>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border/70 bg-muted/20 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-xs font-medium">{value}</span>
    </div>
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

function PaginationBar({
  currentPage,
  totalPages,
  totalItems,
  pageJump,
  onPageJumpChange,
  onJump,
  onPrevious,
  onNext,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageJump: string;
  onPageJumpChange: (value: string) => void;
  onJump: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (totalItems <= PAGE_SIZE) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <div>共 {totalItems} 个音色，每页 {PAGE_SIZE} 个，第 {currentPage} / {totalPages} 页</div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" disabled={currentPage <= 1} onClick={onPrevious}>
          <span className="sr-only">上一页</span>
          <span aria-hidden="true">‹</span>
        </Button>
        <Input
          type="number"
          min={1}
          max={totalPages}
          value={pageJump}
          onChange={(event) => onPageJumpChange(event.target.value)}
          onBlur={onJump}
          onKeyDown={(event) => {
            if (event.key === "Enter") onJump();
          }}
          className="h-8 w-16 text-center"
          aria-label="跳转页码"
        />
        <Button variant="outline" size="icon-sm" disabled={currentPage >= totalPages} onClick={onNext}>
          <span className="sr-only">下一页</span>
          <span aria-hidden="true">›</span>
        </Button>
      </div>
    </div>
  );
}

function CenteredState({ icon: Icon, label, hint, action, spin }: { icon: typeof Gear; label: string; hint?: string; action?: React.ReactNode; spin?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
      <Icon size={40} className={cn("opacity-30", spin && "animate-spin")} />
      <p className="text-sm">{label}</p>
      {hint && <p className="text-xs opacity-70">{hint}</p>}
      {action}
    </div>
  );
}
