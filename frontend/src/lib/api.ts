import axios from "axios"

const api = axios.create({
  baseURL: "http://localhost:8000",
})

/** Extracts a user-facing message from an API or network error. */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data
    if (typeof data === "object" && data !== null && "detail" in data) {
      const detail = (data as { detail: unknown }).detail
      if (typeof detail === "string") {
        return detail
      }
    }
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return "Something went wrong"
}

export type BenchStatus = "running" | "stopped" | "unknown"

export type AppInfo = {
  name: string
  version: string
}

export type SiteInfo = {
  name: string
  installed_apps: AppInfo[]
}

export type BenchSummary = {
  name: string
  path: string
  frappe_version: string
  status: BenchStatus
  site_count: number
  app_count: number
  /** Present when merged from live WebSocket updates or detail fetch. */
  pid?: number | null
}

export type BenchDetail = {
  name: string
  path: string
  frappe_version: string
  status: BenchStatus
  site_count: number
  app_count: number
  sites: SiteInfo[]
  apps: AppInfo[]
  pid: number | null
  ports: Record<string, string>
}

export type Settings = {
  root_scan_dir: string
  excluded_paths: string[]
  scan_interval_seconds: number
  backend_host: string
  backend_port: number
}

export async function getBenches(): Promise<BenchSummary[]> {
  const res = await api.get<BenchSummary[]>("/api/benches")
  return res.data
}

export async function getBench(name: string): Promise<BenchDetail> {
  const res = await api.get<BenchDetail>(
    `/api/benches/${encodeURIComponent(name)}`
  )
  return res.data
}

export async function startBench(name: string): Promise<void> {
  await api.post(`/api/benches/${encodeURIComponent(name)}/start`)
}

export async function stopBench(name: string): Promise<void> {
  await api.post(`/api/benches/${encodeURIComponent(name)}/stop`)
}

export async function restartBench(name: string): Promise<void> {
  await api.post(`/api/benches/${encodeURIComponent(name)}/restart`)
}

export async function getSettings(): Promise<Settings> {
  const res = await api.get<Settings>("/api/settings")
  return res.data
}

export async function updateSettings(
  data: Partial<Settings>
): Promise<Settings> {
  const current = await getSettings()
  const body: Settings = {
    root_scan_dir: data.root_scan_dir ?? current.root_scan_dir,
    excluded_paths: data.excluded_paths ?? current.excluded_paths,
    scan_interval_seconds:
      data.scan_interval_seconds ?? current.scan_interval_seconds,
    backend_host: data.backend_host ?? current.backend_host,
    backend_port: data.backend_port ?? current.backend_port,
  }
  const res = await api.put<Settings>("/api/settings", body)
  return res.data
}

export type InitAppItem = {
  name: string
  repo_url: string
  branch?: string
}

export type InitOperationBody = {
  bench_name: string
  parent_dir: string
  frappe_version: "version-15" | "version-14" | "develop"
  site_name: string
  admin_password: string
  db_root_password: string
  apps: InitAppItem[]
  /** Passed to ``bench init --python``; default matches backend. */
  python_version: string
}

export type OperationIdResponse = {
  operation_id: string
}

export async function postOperationInit(
  body: InitOperationBody
): Promise<OperationIdResponse> {
  const res = await api.post<OperationIdResponse>("/api/operations/init", body)
  return res.data
}

export type GetAppOperationBody = {
  bench_name: string
  repo_url: string
  branch?: string
}

export async function postOperationGetApp(
  body: GetAppOperationBody
): Promise<OperationIdResponse> {
  const res = await api.post<OperationIdResponse>(
    "/api/operations/get-app",
    body
  )
  return res.data
}

export type NewSiteOperationBody = {
  bench_name: string
  site_name: string
  admin_password: string
  db_root_password: string
  apps: string[]
}

export async function postOperationNewSite(
  body: NewSiteOperationBody
): Promise<OperationIdResponse> {
  const res = await api.post<OperationIdResponse>(
    "/api/operations/new-site",
    body
  )
  return res.data
}

export type InstallAppOnSiteBody = {
  bench_name: string
  site_name: string
  apps: string[]
}

export async function postOperationInstallAppOnSite(
  body: InstallAppOnSiteBody
): Promise<OperationIdResponse> {
  const res = await api.post<OperationIdResponse>(
    "/api/operations/install-app",
    body
  )
  return res.data
}

/**
 * WebSocket URL for streaming operation logs (matches the axios ``baseURL`` host).
 */
export function getOperationsWebSocketUrl(operationId: string): string {
  const base =
    typeof api.defaults.baseURL === "string"
      ? api.defaults.baseURL
      : "http://localhost:8000"
  const parsed = new URL(base)
  const wsScheme = parsed.protocol === "https:" ? "wss:" : "ws:"
  return `${wsScheme}//${parsed.host}/ws/operations/${encodeURIComponent(operationId)}`
}
