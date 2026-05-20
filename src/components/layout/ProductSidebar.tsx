"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Gear,
  RowsPlusBottom,
  UserFocus,
  Waveform,
} from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

const navItems = [
  { href: "/creation-center", labelKey: "nav.creationCenter", icon: RowsPlusBottom },
  { href: "/digital-human", labelKey: "nav.digitalHuman", icon: UserFocus },
  { href: "/voices", labelKey: "nav.voices", icon: Waveform },
] as const;

interface ProductSidebarProps {
  hasUpdate?: boolean;
  readyToInstall?: boolean;
}

export function ProductSidebar({ hasUpdate, readyToInstall }: ProductSidebarProps) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const settingsActive = pathname.startsWith("/settings");

  return (
    <aside className="hidden h-full w-56 shrink-0 flex-col overflow-hidden bg-sidebar/80 backdrop-blur-xl lg:flex">
      <div className="h-3 shrink-0 mt-3" />

      <div className="px-3 pb-3">
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-9 w-full justify-start gap-3 px-2.5 text-sm font-normal",
                    isActive
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon size={17} weight={isActive ? "fill" : "regular"} />
                  {t(item.labelKey)}
                </Button>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto shrink-0 px-3 py-2">
        <Link href="/settings">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-9 w-full justify-start gap-3 px-2.5 text-sm font-normal",
              settingsActive
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Gear size={17} weight={settingsActive ? "fill" : "regular"} />
            {t("nav.settings")}
            {(hasUpdate || readyToInstall) && (
              <span
                className={cn(
                  "ml-auto h-2 w-2 rounded-full bg-primary",
                  !readyToInstall && "animate-pulse",
                )}
              />
            )}
          </Button>
        </Link>
      </div>
    </aside>
  );
}
