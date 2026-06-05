"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowsClockwise, Key, SpinnerGap, UserCircle, UserFocus } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/hooks/useTranslation";
import type { TranslationKey } from "@/i18n";
import { shouldBypassShuanQAuth, shouldRefreshAfterShuanQAction, shuanQAuthEndpoint, type ShuanQAuthAction } from "@/lib/shuanq/auth-gate-policy";

interface PublicShuanQStatus {
  bootstrapped: boolean;
  authenticated: boolean;
  verifyMode: number;
  appInfoUnavailable: boolean;
  message: string;
  gonggao: string;
  account: string;
  expireTime: string;
  permissions: string[];
  score: number;
  lastHeartbeatAt: string | null;
}

const emptyStatus: PublicShuanQStatus = {
  bootstrapped: false,
  authenticated: false,
  verifyMode: 1,
  appInfoUnavailable: false,
  message: "",
  gonggao: "",
  account: "",
  expireTime: "",
  permissions: [],
  score: 0,
  lastHeartbeatAt: null,
};

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data.error || response.statusText));
  }
  return data as T;
}

export function ShuanQAuthGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PublicShuanQStatus>(emptyStatus);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<ShuanQAuthAction | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [card, setCard] = useState("");
  const [activeTab, setActiveTab] = useState<ShuanQAuthAction>("login");

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await readJson<{ status: PublicShuanQStatus }>(await fetch("/api/auth/shuanq/status", { cache: "no-store" }));
      setStatus(data.status);
      if (data.status.account) setAccount(data.status.account);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const submit = async (kind: ShuanQAuthAction) => {
    setBusy(kind);
    setError("");
    setNotice("");
    try {
      const payload = kind === "card"
        ? { account, card }
        : kind === "register"
          ? { account, password, nickname: nickname || account }
          : { account, password };
      const data = await readJson<{ status?: PublicShuanQStatus; message?: string; ok?: boolean }>(await fetch(shuanQAuthEndpoint(kind), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }));
      if (data.status) {
        setStatus(data.status);
      }
      setNotice(data.message || (kind === "register" ? t("auth.registerSuccess" as TranslationKey) : t("auth.cardSuccess" as TranslationKey)));
      if (kind === "register") {
        setActiveTab("login");
      }
      if (shouldRefreshAfterShuanQAction(kind)) {
        await refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const statusLine = useMemo(() => {
    if (status.appInfoUnavailable) return t("auth.appInfoUnavailable" as TranslationKey);
    if (!status.bootstrapped) return t("auth.initializing" as TranslationKey);
    return status.gonggao || status.message || t("auth.ready" as TranslationKey);
  }, [status, t]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <SpinnerGap className="size-4 animate-spin" />
          {t("auth.initializing" as TranslationKey)}
        </div>
      </div>
    );
  }

  if (shouldBypassShuanQAuth(status)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="w-full max-w-[420px] rounded-lg border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Key className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight">{t("auth.title" as TranslationKey)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{statusLine}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {notice}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ShuanQAuthAction)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="login">{t("auth.loginTab" as TranslationKey)}</TabsTrigger>
            <TabsTrigger value="register">{t("auth.registerTab" as TranslationKey)}</TabsTrigger>
            <TabsTrigger value="card">{t("auth.cardTab" as TranslationKey)}</TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="mt-5">
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submit("login"); }}>
            <AuthFields account={account} password={password} setAccount={setAccount} setPassword={setPassword} />
            <Button type="submit" className="w-full" disabled={busy !== null}>
              {busy === "login" ? <SpinnerGap className="size-4 animate-spin" /> : <UserCircle className="size-4" />}
              {t("auth.loginButton" as TranslationKey)}
            </Button>
            </form>
          </TabsContent>

          <TabsContent value="register" className="mt-5">
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submit("register"); }}>
            <AuthFields account={account} password={password} setAccount={setAccount} setPassword={setPassword} />
            <div className="space-y-2">
              <Label htmlFor="shuanq-nickname">{t("auth.nickname" as TranslationKey)}</Label>
              <Input id="shuanq-nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} autoComplete="nickname" />
            </div>
            <Button type="submit" className="w-full" disabled={busy !== null}>
              {busy === "register" ? <SpinnerGap className="size-4 animate-spin" /> : <UserFocus className="size-4" />}
              {t("auth.registerButton" as TranslationKey)}
            </Button>
            </form>
          </TabsContent>

          <TabsContent value="card" className="mt-5">
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submit("card"); }}>
            <div className="space-y-2">
              <Label htmlFor="shuanq-card-account">{t("auth.account" as TranslationKey)}</Label>
              <Input id="shuanq-card-account" value={account} onChange={(event) => setAccount(event.target.value)} autoComplete="username" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shuanq-card">{t("auth.card" as TranslationKey)}</Label>
              <Input id="shuanq-card" value={card} onChange={(event) => setCard(event.target.value)} autoComplete="off" />
            </div>
            <Button type="submit" className="w-full" disabled={busy !== null}>
              {busy === "card" ? <SpinnerGap className="size-4 animate-spin" /> : <Key className="size-4" />}
              {t("auth.cardButton" as TranslationKey)}
            </Button>
            </form>
          </TabsContent>
        </Tabs>

        <Button variant="ghost" size="sm" className="mt-4 w-full" onClick={refresh} disabled={busy !== null || loading}>
          <ArrowsClockwise className="size-4" />
          {t("auth.retry" as TranslationKey)}
        </Button>
      </div>
    </div>
  );
}

function AuthFields({
  account,
  password,
  setAccount,
  setPassword,
}: {
  account: string;
  password: string;
  setAccount: (value: string) => void;
  setPassword: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="shuanq-account">{t("auth.account" as TranslationKey)}</Label>
        <Input id="shuanq-account" value={account} onChange={(event) => setAccount(event.target.value)} autoComplete="username" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="shuanq-password">{t("auth.password" as TranslationKey)}</Label>
        <Input id="shuanq-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
      </div>
    </>
  );
}
