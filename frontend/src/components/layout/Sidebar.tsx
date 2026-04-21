import {
  DatabaseIcon,
  Home01Icon,
  Layout01Icon,
  Moon01Icon,
  Settings02Icon,
  SidebarLeftIcon,
  Sun01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { NavLink } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useIsMobile } from "@/hooks/use-mobile"
import { useBenchSocket } from "@/hooks/useBenchSocket"
import { cn } from "@/lib/utils"
import { useUiStore } from "@/stores/ui.store"

const navLinkClass = ({
  isActive,
  collapsed,
}: {
  isActive: boolean
  collapsed: boolean
}) =>
  cn(
    "flex items-center rounded-md text-sm font-medium transition-colors",
    collapsed
      ? "size-10 justify-center"
      : "gap-2 px-3 py-2",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
  )

type NavItemDef = {
  to: string
  label: string
  icon: typeof Home01Icon
  end?: boolean
}

const NAV_ITEMS: NavItemDef[] = [
  { to: "/", label: "Dashboard", icon: Home01Icon, end: true },
  { to: "/templates", label: "Templates", icon: Layout01Icon },
  { to: "/database", label: "Database", icon: DatabaseIcon },
  { to: "/settings", label: "Settings", icon: Settings02Icon },
]

function SidebarNav({
  collapsed,
  toggleSidebar,
  onNavigate,
  connected,
}: {
  collapsed: boolean
  toggleSidebar: () => void
  onNavigate?: () => void
  connected: boolean
}) {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)

  const nextTheme = theme === "dark" ? "light" : "dark"

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
        <div
          className={cn(
            "flex shrink-0 items-center border-b border-sidebar-border",
            collapsed
              ? "justify-center px-2 py-3"
              : "justify-between px-4 py-4"
          )}
        >
          {!collapsed && (
            <span className="font-heading text-base font-semibold tracking-tight select-none">
              Bench Manager
            </span>
          )}
          {collapsed && <span className="sr-only">Bench Manager</span>}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "hidden text-sidebar-foreground md:inline-flex",
                  collapsed && "size-10"
                )}
                onClick={() => toggleSidebar()}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <HugeiconsIcon
                  icon={SidebarLeftIcon}
                  className={collapsed ? "size-5" : "size-4"}
                />
              </Button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            )}
          </Tooltip>
        </div>
        <nav
          className={cn(
            "flex flex-1 flex-col gap-1 p-2",
            collapsed && "items-center"
          )}
        >
          {NAV_ITEMS.map((item) => {
            const link = (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  navLinkClass({ isActive, collapsed })
                }
              >
                <HugeiconsIcon
                  icon={item.icon}
                  className={cn("shrink-0", collapsed ? "size-5" : "size-4")}
                />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            )

            if (collapsed) {
              return (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              )
            }

            return link
          })}
        </nav>
        <div
          className={cn(
            "mt-auto flex flex-col gap-2 border-t border-sidebar-border p-2",
            collapsed && "items-center"
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2 px-2 text-xs text-sidebar-foreground/80",
              collapsed && "justify-center px-0"
            )}
          >
            <span
              className={cn(
                "inline-block size-2 shrink-0 rounded-full",
                connected
                  ? "bg-emerald-500"
                  : "animate-pulse-dot bg-muted-foreground/50"
              )}
              aria-hidden
            />
            {collapsed ? (
              <span className="sr-only">
                {connected ? "Live connection" : "Connecting"}
              </span>
            ) : connected ? (
              <span>Live</span>
            ) : (
              <span>Connecting…</span>
            )}
          </div>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10 text-sidebar-foreground"
                  onClick={() => setTheme(nextTheme)}
                  aria-label={
                    nextTheme === "dark"
                      ? "Switch to dark theme"
                      : "Switch to light theme"
                  }
                >
                  <HugeiconsIcon
                    icon={theme === "dark" ? Sun01Icon : Moon01Icon}
                    className="size-5 shrink-0"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="default"
              className="w-full justify-start gap-2 text-sidebar-foreground"
              onClick={() => setTheme(nextTheme)}
              aria-label={
                nextTheme === "dark"
                  ? "Switch to dark theme"
                  : "Switch to light theme"
              }
            >
              <HugeiconsIcon
                icon={theme === "dark" ? Sun01Icon : Moon01Icon}
                className="size-4 shrink-0"
              />
              <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
            </Button>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

export function Sidebar() {
  const { connected } = useBenchSocket()
  const isMobile = useIsMobile()
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  const closeMobileIfNeeded = () => {
    if (isMobile && sidebarOpen) toggleSidebar()
  }

  if (isMobile) {
    return (
      <Sheet
        open={sidebarOpen}
        onOpenChange={(open) => {
          const current = useUiStore.getState().sidebarOpen
          if (open !== current) toggleSidebar()
        }}
      >
        <SheetContent side="left" className="w-72 p-0">
          <SidebarNav
            collapsed={false}
            toggleSidebar={toggleSidebar}
            onNavigate={closeMobileIfNeeded}
            connected={connected}
          />
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <aside
      className={cn(
        "hidden h-full shrink-0 border-r border-sidebar-border bg-sidebar md:flex md:flex-col",
        sidebarOpen ? "w-56" : "w-14"
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <SidebarNav
          collapsed={!sidebarOpen}
          toggleSidebar={toggleSidebar}
          connected={connected}
        />
      </div>
    </aside>
  )
}
