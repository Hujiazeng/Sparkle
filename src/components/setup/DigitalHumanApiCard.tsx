'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SetupCard } from './SetupCard';
import type { SetupCardStatus } from '@/types';
import { SpinnerGap } from '@/components/ui/icon';

interface DigitalHumanApiCardProps {
  status: SetupCardStatus;
  onStatusChange: (status: SetupCardStatus) => void;
}

export function DigitalHumanApiCard({ status, onStatusChange }: DigitalHumanApiCardProps) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState('');

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/digital-human');
      if (!res.ok) return;
      const data = await res.json();
      setToken(data.settings?.skyhuman_api_token || '');
      onStatusChange(data.settings?.configured ? 'completed' : 'not-configured');
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSaveAndVerify = useCallback(async () => {
    setSaving(true);
    setMessage('');
    try {
      const saveRes = await fetch('/api/settings/digital-human', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { skyhuman_api_token: token } }),
      });
      if (!saveRes.ok) {
        const data = await saveRes.json().catch(() => ({}));
        throw new Error(data.error || '保存失败');
      }

      setVerifying(true);
      const verifyRes = await fetch('/api/settings/digital-human/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok || !verifyData.verified) {
        throw new Error(verifyData.error || '连接验证失败');
      }

      onStatusChange('completed');
      await fetch('/api/setup', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card: 'digitalHuman', status: 'completed' }),
      });
      setMessage(`连接成功，剩余积分：${verifyData.credit ?? 0}`);
    } catch (error) {
      onStatusChange('needs-fix');
      setMessage(error instanceof Error ? error.message : '数字人配置失败');
    } finally {
      setSaving(false);
      setVerifying(false);
    }
  }, [fetchSettings, onStatusChange, token]);

  const handleSkip = useCallback(async () => {
    onStatusChange('skipped');
    try {
      await fetch('/api/setup', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card: 'digitalHuman', status: 'skipped' }),
      });
    } catch {
      // ignore
    }
  }, [onStatusChange]);

  const description = status === 'completed'
    ? '数字人 API 已配置，可同步形象并提交克隆任务。'
    : '填写飞天数字人的 fly_agent_token，用于数字人形象管理。';

  return (
    <SetupCard
      title="数字人 API"
      description={description}
      status={status}
      onSkip={status === 'not-configured' ? handleSkip : undefined}
    >
      {loading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <SpinnerGap size={14} className="animate-spin" />
          正在读取配置...
        </p>
      ) : status === 'completed' ? (
        <p className="text-xs text-muted-foreground">已连接飞天数字人服务。</p>
      ) : status === 'skipped' ? (
        <p className="text-xs text-muted-foreground">已跳过，可在 设置 › 数字人 中随时配置。</p>
      ) : (
        <div className="space-y-2">
          <Input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="请输入 fly_agent_token"
            autoComplete="off"
          />
          {message && <p className="text-xs text-muted-foreground">{message}</p>}
          <Button size="sm" className="text-xs" onClick={handleSaveAndVerify} disabled={saving || verifying || !token}>
            {(saving || verifying) && <SpinnerGap size={14} className="animate-spin" />}
            {verifying ? '验证中...' : '保存并验证'}
          </Button>
        </div>
      )}
    </SetupCard>
  );
}

