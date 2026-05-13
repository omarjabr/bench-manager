import { Add01Icon, ArrowLeft01Icon, Menu01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useLocation, useNavigate, useParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useIsMobile } from "@/hooks/use-mobile"
import { useUiStore } from "@/stores/ui.store"

function usePageInfo(): { title: string; showBack: boolean } {
  const { pathname } = useLocation()
  const { name } = useParams()

  if (pathname === "/") return { title: "Dashboard", showBack: false }
  if (pathname.startsWith("/benches/")) {
    const benchName = name
      ? decodeURIComponent(name)
      : "Bench"
    return { title: benchName, showBack: true }
  }
  if (pathname === "/templates") return { title: "Templates", showBack: false }
  if (pathname === "/database") return { title: "Database", showBack: false }
  if (pathname === "/servers") return { title: "Servers", showBack: false }
  if (pathname === "/settings") return { title: "Settings", showBack: false }
  return { title: "Bench Manager", showBack: false }
}

type TopbarProps = {
  searchQuery: string
  onSearchChange: (value: string) => void
  onNewBench: () => void
}

export function Topbar({
  searchQuery,
  onSearchChange,
  onNewBench,
}: TopbarProps) {
  const { title, showBack } = usePageInfo()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
      {isMobile && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => toggleSidebar()}
          aria-label="Open menu"
        >
          <HugeiconsIcon icon={Menu01Icon} className="size-5" />
        </Button>
      )}
      {showBack && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => navigate("/")}
          aria-label="Back to Dashboard"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" />
        </Button>
      )}
      <h1 className="min-w-0 shrink truncate font-heading text-lg font-semibold tracking-tight">
        {title}
      </h1>
      <div className="mx-auto min-w-0 max-w-md flex-1 px-1">
        <Input
          type="search"
          placeholder="Search benches…"
          aria-label="Search benches"
          className="h-9 w-full"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          onClick={() => onNewBench()}
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          <span className="hidden sm:inline">New Bench</span>
        </Button>
      </div>
    </header>
  )
}
