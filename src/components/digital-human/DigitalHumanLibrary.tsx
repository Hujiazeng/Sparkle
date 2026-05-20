"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Clock,
  Funnel,
  Gear,
  Heart,
  Image,
  PaintBrush,
  Plus,
  SortDescending,
  SpinnerGap,
  Trash,
  UploadSimple,
  WarningCircle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { showToast } from "@/hooks/useToast";
import { refreshDigitalHumanAssets } from "@/lib/digital-human-assets-cache";

type AvatarStatus = "ready" | "training" | "failed";
type SortOrder = "newest" | "oldest";
type StatusFilter = "all" | AvatarStatus;
const PAGE_SIZE = 12;
const GRID_COLUMNS_CLASS = "grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6";
const CARD_ASPECT_CLASS = "aspect-[9/16]";

interface DigitalHumanAvatar {
  id: string;
  avatarCode: string;
  title: string;
  coverImageUrl: string;
  isFavorite: boolean;
  status: AvatarStatus;
  createdAt: string;
  note: string;
  taskId?: string;
}

const statusMeta: Record<AvatarStatus, { label: string; icon: typeof Clock; className: string }> = {
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

function normalizeAvatar(raw: Record<string, unknown>): DigitalHumanAvatar {
  const id = raw.id ?? raw.avatarCode ?? raw.avatar_code ?? raw.taskId ?? Date.now();
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : "";
  return {
    id: String(id),
    avatarCode: String(raw.avatarCode ?? raw.avatar_code ?? ""),
    title: String(raw.title || "未命名数字人"),
    coverImageUrl: String(raw.coverImageUrl || raw.cover_image_url || "/buddy/robot.png"),
    isFavorite: Boolean(raw.isFavorite ?? raw.is_favorite),
    status: normalizeStatus(raw.status),
    createdAt,
    note: typeof raw.note === "string" && raw.note ? raw.note : "已同步自飞天数字人，可用于后续数字人视频创作。",
    taskId: typeof raw.taskId === "string" ? raw.taskId : undefined,
  };
}

function normalizeStatus(status: unknown): AvatarStatus {
  const value = String(status || "").toLowerCase();
  if (["failed", "fail", "error", "cancelled", "canceled"].includes(value)) return "failed";
  if (["ready", "success", "succeeded", "done", "completed", "finish", "finished"].includes(value)) return "ready";
  return value ? "training" : "ready";
}

function createPendingAvatar(title: string, taskId: string): DigitalHumanAvatar {
  return {
    id: `task-${taskId}`,
    avatarCode: "",
    title: title.trim() || "未命名数字人",
    coverImageUrl: "/buddy/robot.png",
    isFavorite: false,
    status: "training",
    createdAt: new Date().toISOString().slice(0, 10),
    note: "克隆任务已提交，等待平台处理完成。",
    taskId,
  };
}

export function DigitalHumanLibrary() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatars, setAvatars] = useState<DigitalHumanAvatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [page, setPage] = useState(1);
  const [pageJump, setPageJump] = useState("1");
  const [selectedAvatar, setSelectedAvatar] = useState<DigitalHumanAvatar | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [selectedVideoName, setSelectedVideoName] = useState("");
  const [selectedVideoUrl, setSelectedVideoUrl] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchAvatars = useCallback(async (favoriteOnly = favoritesOnly) => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/digital-human/avatars${favoriteOnly ? "?favoriteOnly=1" : ""}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "获取数字人列表失败");
      }
      setConfigured(data.configured !== false);
      setAvatars(Array.isArray(data.avatars) ? data.avatars.map(normalizeAvatar) : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "获取数字人列表失败");
    } finally {
      setLoading(false);
    }
  }, [favoritesOnly]);

  useEffect(() => {
    fetchAvatars();
  }, [fetchAvatars]);

  useEffect(() => {
    const handler = () => fetchAvatars();
    window.addEventListener("digital-human-settings-changed", handler);
    return () => window.removeEventListener("digital-human-settings-changed", handler);
  }, [fetchAvatars]);

  useEffect(() => {
    const pendingTasks = avatars.filter((avatar) => avatar.status === "training" && avatar.taskId);
    if (pendingTasks.length === 0) return;

    const timer = window.setInterval(() => {
      pendingTasks.forEach(async (pending) => {
        try {
          const res = await fetch(`/api/digital-human/avatar-task?taskId=${encodeURIComponent(pending.taskId || "")}`);
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "查询数字人任务失败");

          const nextStatus = normalizeStatus(data.status);
          if (nextStatus === "training") return;

          if (nextStatus === "ready") {
            await fetchAvatars();
            await refreshDigitalHumanAssets("avatars");
            showToast({ type: "success", message: "数字人克隆已完成" });
            return;
          }

          setAvatars((current) =>
            current.map((avatar) =>
              avatar.taskId === pending.taskId
                ? { ...avatar, status: "failed", note: data.message || "克隆任务失败，请检查源视频后重试。" }
                : avatar,
            ),
          );
          setSelectedAvatar((current): DigitalHumanAvatar | null => {
            if (!current || current.taskId !== pending.taskId) return current;
            return { ...current, status: "failed", note: data.message || "克隆任务失败，请检查源视频后重试。" };
          });
        } catch (error) {
          console.error("[digital-human] task poll failed", error);
        }
      });
    }, 6000);

    return () => window.clearInterval(timer);
  }, [avatars, fetchAvatars]);

  const filteredAvatars = useMemo(() => {
    return avatars
      .filter((avatar) => {
        if (favoritesOnly && !avatar.isFavorite) return false;
        if (statusFilter !== "all" && avatar.status !== statusFilter) return false;
        if (dateFrom && avatar.createdAt < dateFrom) return false;
        if (dateTo && avatar.createdAt > dateTo) return false;
        return true;
      })
      .sort((a, b) => {
        const result = a.createdAt.localeCompare(b.createdAt);
        return sort === "oldest" ? result : -result;
      });
  }, [avatars, dateFrom, dateTo, favoritesOnly, sort, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredAvatars.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filteredAvatars.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [currentPage, filteredAvatars],
  );

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, favoritesOnly, sort, statusFilter]);

  useEffect(() => {
    setPageJump(String(currentPage));
  }, [currentPage]);

  const handleSelect = useCallback((avatar: DigitalHumanAvatar) => {
    setSelectedAvatar(avatar);
    setDetailOpen(true);
  }, []);

  const handleSync = useCallback(async () => {
    await fetchAvatars();
    await refreshDigitalHumanAssets("avatars");
  }, [fetchAvatars]);

  const handleDelete = useCallback(async (avatar: DigitalHumanAvatar) => {
    if (!avatar.avatarCode) {
      setAvatars((current) => current.filter((item) => item.id !== avatar.id));
      setDetailOpen(false);
      setSelectedAvatar(null);
      showToast({ type: "success", message: "已移除本地待处理任务" });
      return;
    }

    try {
      const res = await fetch("/api/digital-human/avatars/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarCode: avatar.avatarCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "删除数字人失败");
      setAvatars((current) => current.filter((item) => item.id !== avatar.id));
      setDetailOpen(false);
      setSelectedAvatar(null);
      showToast({ type: "success", message: "数字人已删除" });
    } catch (error) {
      showToast({ type: "error", message: error instanceof Error ? error.message : "删除数字人失败" });
    }
  }, []);

  const resetCreateForm = useCallback((revokeVideoUrl = true) => {
    if (revokeVideoUrl && selectedVideoUrl) {
      URL.revokeObjectURL(selectedVideoUrl);
    }
    setNewTitle("");
    setSelectedVideoFile(null);
    setSelectedVideoName("");
    setSelectedVideoUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [selectedVideoUrl]);

  const handleVideoSelected = useCallback((files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (selectedVideoUrl) {
      URL.revokeObjectURL(selectedVideoUrl);
    }
    setSelectedVideoFile(file);
    setSelectedVideoName(file.name);
    setSelectedVideoUrl(URL.createObjectURL(file));
  }, [selectedVideoUrl]);

  const handleCreate = useCallback(async () => {
    if (!selectedVideoFile) {
      showToast({ type: "warning", message: "请先选择一个视频" });
      return;
    }

    setCreating(true);
    try {
      const formData = new FormData();
      formData.append("title", newTitle.trim() || "未命名数字人");
      formData.append("video", selectedVideoFile);
      const res = await fetch("/api/digital-human/avatars", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.taskId) {
        throw new Error(data.error || "提交数字人克隆任务失败");
      }

      const avatar = createPendingAvatar(newTitle, data.taskId);
      setAvatars((current) => [avatar, ...current]);
      setSelectedAvatar(avatar);
      setCreateOpen(false);
      setDetailOpen(true);
      resetCreateForm();
      showToast({ type: "success", message: "数字人克隆任务已提交" });
    } catch (error) {
      showToast({ type: "error", message: error instanceof Error ? error.message : "提交数字人克隆任务失败" });
    } finally {
      setCreating(false);
    }
  }, [newTitle, resetCreateForm, selectedVideoFile]);

  const clearFilters = useCallback(() => {
    setDateFrom("");
    setDateTo("");
    setStatusFilter("all");
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

  const hasExtraFilters = dateFrom || dateTo || statusFilter !== "all";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border/50 px-6 pb-4 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">数字人</h1>
            <p className="mt-1 text-sm text-muted-foreground">管理可复用的数字人形象资产</p>
          </div>
          <Button size="sm" className="gap-1" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
            创建数字人
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSync}
            disabled={loading}
          >
            <ArrowClockwise size={14} className={loading ? "animate-spin" : undefined} />
            同步
          </Button>
          <Button
            variant={favoritesOnly ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFavoritesOnly((value) => !value)}
          >
            <Heart
              size={14}
              className={cn(favoritesOnly && "text-status-error-foreground")}
              weight={favoritesOnly ? "fill" : "regular"}
            />
            只看收藏
          </Button>
          <Button
            variant={showFilters ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowFilters((value) => !value)}
          >
            <Funnel size={14} />
            筛选
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSort((value) => (value === "newest" ? "oldest" : "newest"))}
          >
            <SortDescending size={14} />
            {sort === "newest" ? "最新优先" : "最早优先"}
          </Button>
        </div>

        {showFilters && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted-foreground">状态</label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger className="h-7 w-[120px] px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="ready">可用</SelectItem>
                <SelectItem value="training">克隆中</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
              </SelectContent>
            </Select>
            <label className="text-xs text-muted-foreground">开始日期</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-7 w-auto px-2 text-xs"
            />
            <label className="text-xs text-muted-foreground">结束日期</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="h-7 w-auto px-2 text-xs"
            />
            {hasExtraFilters && (
              <Button variant="ghost" size="xs" onClick={clearFilters}>
                清除筛选
              </Button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex h-full items-center justify-center">
            <SpinnerGap size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : !configured ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Gear size={40} className="opacity-30" />
            <p className="text-sm">请先配置数字人 API Token</p>
            <p className="text-xs opacity-70">配置完成后会自动同步真实数字人列表。</p>
            <Button size="sm" onClick={() => { window.location.href = "/settings#digital-human"; }}>
              前往设置
            </Button>
          </div>
        ) : loadError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <WarningCircle size={40} className="opacity-30" />
            <p className="text-sm">{loadError}</p>
            <Button size="sm" variant="outline" onClick={handleSync}>
              <ArrowClockwise size={14} />
              重新同步
            </Button>
          </div>
        ) : filteredAvatars.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <PaintBrush size={40} className="opacity-30" />
            <p className="text-sm">暂无数字人形象</p>
            <p className="text-xs opacity-70">创建或同步后即可在此查看。</p>
          </div>
        ) : (
          <>
            <DigitalHumanGrid items={pageItems} onSelect={handleSelect} />
            <PaginationBar
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredAvatars.length}
              pageJump={pageJump}
              onPageJumpChange={setPageJump}
              onJump={jumpToPage}
              onPrevious={() => setPage((value) => Math.max(1, value - 1))}
              onNext={() => setPage((value) => Math.min(totalPages, value + 1))}
            />
          </>
        )}
      </div>

      <DigitalHumanDetail
        avatar={selectedAvatar}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onDelete={handleDelete}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>创建数字人</DialogTitle>
            <DialogDescription>选择本地视频并确认后开始提交克隆任务。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="digital-human-title">名称</Label>
              <Input
                id="digital-human-title"
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder="例如：新品发布讲解员"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="digital-human-video">视频</Label>
              <input
                ref={fileInputRef}
                id="digital-human-video"
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(event) => handleVideoSelected(event.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadSimple size={14} />
                {selectedVideoName || "选择本地视频"}
              </Button>
              {selectedVideoUrl && (
                <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/30">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video src={selectedVideoUrl} controls className="block max-h-[240px] w-full bg-black" />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
                resetCreateForm();
              }}
            >
              取消
            </Button>
            <Button onClick={handleCreate} disabled={!selectedVideoFile || creating}>
              {creating && <SpinnerGap size={14} className="animate-spin" />}
              提交
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DigitalHumanGrid({
  items,
  onSelect,
}: {
  items: DigitalHumanAvatar[];
  onSelect: (avatar: DigitalHumanAvatar) => void;
}) {
  return (
    <div className={GRID_COLUMNS_CLASS}>
      {items.map((avatar) => (
        <button
          key={avatar.id}
          type="button"
          className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-lg bg-muted/30 text-left ring-0 transition-all hover:ring-2 hover:ring-border"
          onClick={() => onSelect(avatar)}
        >
          <div className={cn("relative w-full overflow-hidden bg-muted/40", CARD_ASPECT_CLASS)}>
            <AvatarPreview avatar={avatar} />
            {avatar.isFavorite && (
              <span className="absolute left-1.5 top-1.5">
                <Heart size={16} className="text-status-error-foreground drop-shadow" weight="fill" />
              </span>
            )}
          </div>
          <div className="flex min-h-11 items-center justify-between gap-2 px-2.5 py-2">
            <span className="min-w-0 truncate text-xs font-medium leading-4">{avatar.title}</span>
            <StatusBadge status={avatar.status} />
          </div>
        </button>
      ))}
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
      <div>
        共 {totalItems} 个形象，每页 {PAGE_SIZE} 个，第 {currentPage} / {totalPages} 页
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" disabled={currentPage <= 1} onClick={onPrevious}>
          <CaretLeft size={14} />
          <span className="sr-only">上一页</span>
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
          <CaretRight size={14} />
          <span className="sr-only">下一页</span>
        </Button>
      </div>
    </div>
  );
}

function DigitalHumanDetail({
  avatar,
  open,
  onOpenChange,
  onDelete,
}: {
  avatar: DigitalHumanAvatar | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (avatar: DigitalHumanAvatar) => void;
}) {
  if (!avatar) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>数字人详情</DialogTitle>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-[260px_1fr]">
          <div className={cn("relative overflow-hidden rounded-lg bg-muted/30", CARD_ASPECT_CLASS)}>
            <AvatarPreview avatar={avatar} controls />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{avatar.title}</h2>
              <StatusBadge status={avatar.status} />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{avatar.note}</p>
            <p className="mt-4 text-xs text-muted-foreground">
              创建时间：{avatar.createdAt || "未知"}
            </p>
            {avatar.avatarCode && (
              <p className="mt-2 text-xs text-muted-foreground">形象标识：{avatar.avatarCode}</p>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => onDelete(avatar)}>
                <Trash size={14} />
                {avatar.avatarCode ? "删除" : "移除"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AvatarPreview({ avatar }: { avatar: DigitalHumanAvatar; controls?: boolean }) {
  return (
    <div className="absolute inset-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatar.coverImageUrl}
        alt={avatar.title}
        className="block h-full w-full object-cover"
        loading="lazy"
      />
      {avatar.coverImageUrl === "/buddy/robot.png" && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <Image size={28} className="opacity-50" />
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: AvatarStatus }) {
  const meta = statusMeta[status];
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium", meta.className)}>
      <Icon size={11} className={status === "training" ? "animate-spin" : undefined} />
      {meta.label}
    </span>
  );
}
