import {
  ArrowDown01Icon,
  ArrowUp01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { SiteInfo } from "@/lib/api"

type SiteListProps = {
  sites: SiteInfo[]
}

export function SiteList({ sites }: SiteListProps) {
  if (sites.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No sites found</p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {sites.map((site) => (
        <SiteRow key={site.name} site={site} />
      ))}
    </ul>
  )
}

function SiteRow({ site }: { site: SiteInfo }) {
  const [open, setOpen] = useState(false)

  return (
    <li className="rounded-lg border border-border bg-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-1 px-2 py-1">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-expanded={open}
              aria-label={
                open ? `Collapse apps for ${site.name}` : `Expand apps for ${site.name}`
              }
            >
              <HugeiconsIcon
                icon={open ? ArrowUp01Icon : ArrowDown01Icon}
                className="size-4"
              />
            </Button>
          </CollapsibleTrigger>
          <span className="min-w-0 flex-1 font-medium">{site.name}</span>
        </div>
        <CollapsibleContent>
          <div className="border-t border-border px-3 py-2 pl-11">
            {site.installed_apps.length === 0 ? (
              <p className="text-muted-foreground text-xs">No apps on this site</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {site.installed_apps.map((app) => (
                  <li
                    key={`${site.name}-${app.name}`}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span>{app.name}</span>
                    <Badge variant="outline" className="font-mono text-xs">
                      {app.version}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}
