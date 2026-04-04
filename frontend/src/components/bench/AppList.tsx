import { Badge } from "@/components/ui/badge"
import type { AppInfo } from "@/lib/api"

type AppListProps = {
  apps: AppInfo[]
}

export function AppList({ apps }: AppListProps) {
  if (apps.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No apps installed</p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {apps.map((app) => (
        <li
          key={app.name}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
        >
          <span className="font-medium">{app.name}</span>
          <Badge variant="secondary" className="font-mono text-xs">
            {app.version}
          </Badge>
        </li>
      ))}
    </ul>
  )
}
