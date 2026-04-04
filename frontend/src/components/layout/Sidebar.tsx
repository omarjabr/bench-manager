import {
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
import { useIsMobile } from "@/hooks/use-mobile"
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
    "flex items-center gap-2 rounded-md py-2 text-sm font-medium transition-colors",
    collapsed ? "justify-center px-0" : "px-3",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
  )

function SidebarNav({
  collapsed,
  toggleSidebar,
  onNavigate,
}: {
  collapsed: boolean
  toggleSidebar: () => void
  onNavigate?: () => void
}) {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)

  const nextTheme = theme === "dark" ? "light" : "dark"

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          "flex items-center justify-between border-b border-sidebar-border px-4 py-4",
          collapsed && "px-2"
        )}
      >
        {!collapsed && (
          <span className="font-heading text-base font-semibold tracking-tight">
            Bench Manager
          </span>
        )}
        {collapsed && <span className="sr-only">Bench Manager</span>}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-sidebar-foreground"
          onClick={() => toggleSidebar()}
          aria-label={collapsed ? "Collapse sidebar" : "Expand sidebar"}
        >
          <HugeiconsIcon icon={SidebarLeftIcon} className="size-4" />
        </Button>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-2">
        <NavLink
          to="/"
          end
          onClick={onNavigate}
          className={({ isActive }) => navLinkClass({ isActive, collapsed })}
        >
          <HugeiconsIcon icon={Home01Icon} className="size-4 shrink-0" />
          {!collapsed && <span>Dashboard</span>}
        </NavLink>
        <NavLink
          to="/templates"
          onClick={onNavigate}
          className={({ isActive }) => navLinkClass({ isActive, collapsed })}
        >
          <HugeiconsIcon icon={Layout01Icon} className="size-4 shrink-0" />
          {!collapsed && <span>Templates</span>}
        </NavLink>
        <NavLink
          to="/settings"
          onClick={onNavigate}
          className={({ isActive }) => navLinkClass({ isActive, collapsed })}
        >
          <HugeiconsIcon icon={Settings02Icon} className="size-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </NavLink>
      </nav>
      <div
        className={cn(
          "mt-auto flex flex-col gap-2 border-t border-sidebar-border p-2",
          collapsed && "items-center"
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          className={cn(
            "w-full justify-start gap-2 text-sidebar-foreground",
            collapsed && "justify-center"
          )}
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
          {!collapsed && (
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          )}
        </Button>
      </div>
    </div>
  )
}

export function Sidebar() {
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
          />
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <aside
      className={cn(
        "hidden min-h-screen shrink-0 border-r border-sidebar-border bg-sidebar md:flex md:flex-col",
        sidebarOpen ? "w-56" : "w-14"
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <SidebarNav collapsed={!sidebarOpen} toggleSidebar={toggleSidebar} />
      </div>
    </aside>
  )
}
