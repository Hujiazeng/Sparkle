"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Sparkle,
} from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useClientPlatform } from "@/hooks/useClientPlatform";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

export function AppWindowBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { isWindows, isMac } = useClientPlatform();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, [pathname]);

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      router.back();
    }
  }, [router]);

  const handleForward = useCallback(() => {
    window.history.forward();
  }, []);

  return (
    <header
      className="flex h-11 shrink-0 items-center border-b border-border/60 bg-sidebar/85 px-2 text-sidebar-foreground/75 shadow-[0_1px_0_rgba(255,255,255,0.55)_inset] backdrop-blur-xl dark:shadow-none"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1",
          isMac && "pl-[74px]",
        )}
      >
        <div
          className="flex items-center gap-1 pr-1"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md text-primary">
            <Sparkle size={17} weight="fill" />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-sidebar-foreground/65 hover:text-sidebar-foreground disabled:opacity-35"
                disabled={!canGoBack}
                onClick={handleBack}
              >
                <ArrowLeft size={14} />
                <span className="sr-only">{t("windowBar.back")}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("windowBar.back")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-sidebar-foreground/45 hover:text-sidebar-foreground"
                onClick={handleForward}
              >
                <ArrowRight size={14} />
                <span className="sr-only">{t("windowBar.forward")}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("windowBar.forward")}</TooltipContent>
          </Tooltip>
        </div>

        <div className="ml-auto min-w-0 flex-1" />
      </div>

      {isWindows && <div className="w-[138px] shrink-0" />}
    </header>
  );
}
