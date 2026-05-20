"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, SpinnerGap, WarningCircle } from "@/components/ui/icon";
import { SettingsCard } from "@/components/patterns/SettingsCard";
import { StatusBanner } from "@/components/patterns/StatusBanner";
import { showToast } from "@/hooks/useToast";

export function DigitalHumanSettingsSection() {
  const [token, setToken] = useState("");
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/digital-human");
      if (!res.ok) throw new Error("读取数字人配置失败");
      const data = await res.json();
      setToken(data.settings?.skyhuman_api_token || "");
      setConfigured(!!data.settings?.configured);
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "读取数字人配置失败" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/digital-human", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { skyhuman_api_token: token } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "保存数字人配置失败");
      }
      await fetchSettings();
      setStatus({ type: "success", message: token ? "数字人 API Token 已保存。" : "数字人 API Token 已清空。" });
      showToast({ type: "success", message: "数字人配置已保存" });
      window.dispatchEvent(new Event("digital-human-settings-changed"));
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "保存数字人配置失败" });
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/digital-human/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.verified) {
        throw new Error(data.error || "连接验证失败");
      }
      setStatus({ type: "success", message: `连接成功，当前剩余积分：${data.credit ?? 0}` });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "连接验证失败" });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <SettingsCard
        title="数字人 API"
        description="用于同步数字人形象、上传克隆视频和提交克隆任务。"
      >
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <SpinnerGap size={16} className="animate-spin" />
            正在读取配置...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="skyhuman-token">API Token</Label>
              <Input
                id="skyhuman-token"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="请输入 fly_agent_token"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Token 可在飞天数字人个人中心获取；已保存的 Token 会以掩码形式显示。
              </p>
            </div>

            {status && (
              <StatusBanner
                variant={status.type === "success" ? "success" : status.type === "error" ? "error" : "info"}
                icon={status.type === "success" ? <CheckCircle size={14} /> : <WarningCircle size={14} />}
              >
                {status.message}
              </StatusBanner>
            )}

            {!configured && !token && (
              <StatusBanner variant="info">
                配置完成后，数字人页面会自动同步形象列表并支持提交克隆任务。
              </StatusBanner>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={handleVerify} disabled={verifying || (!token && !configured)}>
                {verifying && <SpinnerGap size={14} className="animate-spin" />}
                测试连接
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <SpinnerGap size={14} className="animate-spin" />}
                保存配置
              </Button>
            </div>
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
