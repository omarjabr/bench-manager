import axios from "axios"

const api = axios.create({
  baseURL: "http://localhost:8000",
})

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
