import {
  ArrowDown01Icon,
  InternetIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { useSiteConfig, useUpdateSiteConfig } from "@/hooks/useSiteConfig"
import type { SiteInfo } from "@/lib/api"
import {
  siteConfigSchema,
  type SiteConfigFormValues,
} from "@/schemas/siteConfig.schema"

type SiteConfigEditorProps = {
  benchName: string
  sites: SiteInfo[]
}

/** Keys treated as boolean toggles (stored as 0/1 in Frappe). */
const TOGGLE_KEYS = new Set([
  "developer_mode",
  "maintenance_mode",
  "allow_tests",
  "server_script_enabled",
  "use_tls",
  "scheduler_enabled",
  "pause_scheduler",
])

/** Keys treated as boolean toggles stored as real `true`/`false` (not 0/1). */
const BOOL_TOGGLE_KEYS = new Set(["ignore_csrf"])

const FIELD_LABELS: Record<string, string> = {
  developer_mode: "Developer Mode",
  maintenance_mode: "Maintenance Mode",
  allow_tests: "Allow Tests",
  server_script_enabled: "Server Script Enabled",
  host_name: "Host Name",
  encryption_key: "Encryption Key",
  mail_server: "Mail Server",
  mail_port: "Mail Port",
  mail_login: "Mail Login",
  mail_password: "Mail Password",
  use_tls: "Use TLS",
  auto_email_id: "Auto Email ID",
  scheduler_enabled: "Scheduler Enabled",
  pause_scheduler: "Pause Scheduler",
  allow_cors: "Allow CORS",
  ignore_csrf: "Ignore CSRF",
}

const LIMITS_LABELS: Record<string, string> = {
  space_usage: "Space Usage Limit",
  emails: "Emails Limit",
  users: "Users Limit",
}

export function SiteConfigEditor({ benchName, sites }: SiteConfigEditorProps) {
  const [selectedSite, setSelectedSite] = useState<string>(
    sites.length > 0 ? sites[0].name : "",
  )
  const [sitePickerOpen, setSitePickerOpen] = useState(false)

  const { data: configData, isLoading } = useSiteConfig(benchName, selectedSite)
  const updateMutation = useUpdateSiteConfig(benchName, selectedSite)

  const form = useForm<SiteConfigFormValues>({
    resolver: zodResolver(siteConfigSchema),
    defaultValues: {},
  })

  useEffect(() => {
    if (configData) {
      const editable = configData.editable as Record<string, unknown>
      const flat: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(editable)) {
        if (key === "limits" && typeof value === "object" && value !== null) {
          flat.limits = value
        } else {
          flat[key] = value
        }
      }
      form.reset(flat as SiteConfigFormValues)
    }
  }, [configData, form])

  const onSubmit = (values: SiteConfigFormValues) => {
    const payload: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && value !== "") {
        payload[key] = value
      }
    }
    updateMutation.mutate(payload)
  }

  const readonlyEntries = useMemo(() => {
    if (!configData) return []
    return Object.entries(configData.readonly)
  }, [configData])

  if (sites.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No sites in this bench. Create a site first to edit its config.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Site picker */}
      <div className="flex flex-col gap-1.5">
        <Label>Site</Label>
        <Popover open={sitePickerOpen} onOpenChange={setSitePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={sitePickerOpen}
              aria-label="Select site"
              className="h-9 w-56 justify-between gap-2 font-normal"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <HugeiconsIcon icon={InternetIcon} className="size-4 shrink-0" />
                <span className="truncate">{selectedSite || "Select site\u2026"}</span>
              </span>
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0" align="start" sideOffset={4}>
            <Command>
              <CommandInput placeholder="Search sites\u2026" />
              <CommandList>
                <CommandEmpty>No site found.</CommandEmpty>
                <CommandGroup>
                  {sites.map((s) => (
                    <CommandItem
                      key={s.name}
                      value={s.name}
                      onSelect={() => {
                        setSelectedSite(s.name)
                        setSitePickerOpen(false)
                      }}
                    >
                      <HugeiconsIcon icon={InternetIcon} className="size-4 shrink-0" />
                      <span className="truncate">{s.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-10 w-full max-w-md" />
        </div>
      ) : configData ? (
        <>
          {/* Editable fields */}
          <form
            onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
            className="flex max-w-xl flex-col gap-4"
          >
            <h3 className="text-sm font-medium">Editable Settings</h3>
            {Object.keys(FIELD_LABELS).map((key) => {
              if (TOGGLE_KEYS.has(key)) {
                return (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <Label htmlFor={key}>{FIELD_LABELS[key]}</Label>
                    <Switch
                      id={key}
                      checked={form.watch(key as keyof SiteConfigFormValues) === 1}
                      onCheckedChange={(checked) =>
                        form.setValue(
                          key as keyof SiteConfigFormValues,
                          checked ? 1 : 0,
                          { shouldDirty: true },
                        )
                      }
                    />
                  </div>
                )
              }
              if (BOOL_TOGGLE_KEYS.has(key)) {
                return (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <Label htmlFor={key}>{FIELD_LABELS[key]}</Label>
                    <Switch
                      id={key}
                      checked={form.watch(key as keyof SiteConfigFormValues) === true}
                      onCheckedChange={(checked) =>
                        form.setValue(
                          key as keyof SiteConfigFormValues,
                          checked,
                          { shouldDirty: true },
                        )
                      }
                    />
                  </div>
                )
              }
              return (
                <div key={key} className="flex flex-col gap-1.5">
                  <Label htmlFor={key}>{FIELD_LABELS[key]}</Label>
                  <Input
                    id={key}
                    type={key === "mail_port" ? "number" : key === "mail_password" ? "password" : "text"}
                    {...form.register(key as keyof SiteConfigFormValues)}
                  />
                </div>
              )
            })}

            {/* Limits section */}
            <h4 className="mt-2 text-sm font-medium">Limits</h4>
            {Object.entries(LIMITS_LABELS).map(([key, label]) => (
              <div key={key} className="flex flex-col gap-1.5">
                <Label htmlFor={`limits.${key}`}>{label}</Label>
                <Input
                  id={`limits.${key}`}
                  type="number"
                  {...form.register(`limits.${key}` as `limits.${string}`)}
                />
              </div>
            ))}

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <Spinner className="size-4" /> : null}
                Save Changes
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => form.reset()}
                disabled={updateMutation.isPending}
              >
                Reset
              </Button>
            </div>
          </form>

          {/* Read-only fields */}
          {readonlyEntries.length > 0 ? (
            <div className="flex max-w-xl flex-col gap-2">
              <h3 className="text-sm font-medium">Read-Only Settings</h3>
              <dl className="grid gap-2 text-sm sm:grid-cols-[180px_1fr]">
                {readonlyEntries.map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-muted-foreground">{key}</dt>
                    <dd className="break-all font-mono text-xs">
                      {typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value ?? "\u2014")}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
