import {
  CpuIcon,
  Database01Icon,
  HardDriveIcon,
  RssConnectedIcon,
  Settings02Icon,
  Time01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ReactNode } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Area, AreaChart, XAxis, YAxis } from "recharts"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { useAnalytics } from "@/hooks/useAnalytics"
import type { SystemAnalyticsSnapshot } from "@/lib/api"

type ChartConfig = Record<
  string,
  {
    label?: ReactNode
    color?: string
  }
>

const MAX_DATA_POINTS = 60
const CHART_HEIGHT = 160

type TimeSeriesDataPoint = {
  time: string
  cpu: number
  memory: number
  disk: number
}

/**
 * Format bytes to a human-readable string with appropriate units.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  )
  const value = bytes / Math.pow(1024, exponent)
  return `${value.toFixed(1)} ${units[exponent]}`
}

/**
 * Format uptime from boot timestamp to a human-readable string.
 */
function formatUptime(bootTimestamp: number): string {
  const now = Date.now() / 1000
  const uptimeSeconds = Math.floor(now - bootTimestamp)

  if (uptimeSeconds < 0) return "Unknown"

  const days = Math.floor(uptimeSeconds / 86400)
  const hours = Math.floor((uptimeSeconds % 86400) / 3600)
  const minutes = Math.floor((uptimeSeconds % 3600) / 60)

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`)

  return parts.join(" ")
}

/**
 * Get color class based on usage percentage.
 */
function getUsageColor(percent: number): string {
  if (percent >= 90) return "text-destructive"
  if (percent >= 75) return "text-amber-500"
  return "text-emerald-500"
}

const cpuChartConfig: ChartConfig = {
  cpu: {
    label: "CPU",
    color: "#3b82f6",
  },
}

const memoryChartConfig: ChartConfig = {
  memory: {
    label: "Memory",
    color: "#10b981",
  },
}

const diskChartConfig: ChartConfig = {
  disk: {
    label: "Disk",
    color: "#8b5cf6",
  },
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  valueClassName,
}: {
  title: string
  value: string
  subtitle?: string
  icon: typeof CpuIcon
  valueClassName?: string
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={icon} className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1">
          <span
            className={`font-heading text-2xl font-bold ${valueClassName ?? ""}`}
          >
            {value}
          </span>
          {subtitle ? (
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function ChartCard({
  title,
  description,
  currentValue,
  data,
  dataKey,
  config,
  icon,
}: {
  title: string
  description: string
  currentValue: string
  data: TimeSeriesDataPoint[]
  dataKey: keyof TimeSeriesDataPoint
  config: ChartConfig
  icon: typeof CpuIcon
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HugeiconsIcon
              icon={icon}
              className="size-4 text-muted-foreground"
            />
            <CardTitle>{title}</CardTitle>
          </div>
          <span className="font-heading text-lg font-bold">{currentValue}</span>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[160px] w-full">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient
                id={`fill-${String(dataKey)}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="5%"
                  stopColor={`var(--color-${String(dataKey)})`}
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor={`var(--color-${String(dataKey)})`}
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 100]}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fontSize: 10 }}
              tickFormatter={(value: number) => `${value}%`}
              width={40}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={(value) =>
                    typeof value === "number"
                      ? `${value.toFixed(1)}%`
                      : String(value)
                  }
                />
              }
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={`var(--color-${String(dataKey)})`}
              fill={`url(#fill-${String(dataKey)})`}
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

function ChartCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-6 w-16" />
        </div>
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[160px] w-full" />
      </CardContent>
    </Card>
  )
}

function MetricCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-20" />
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </CardContent>
    </Card>
  )
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return "Failed to load analytics"
}

export default function Analytics() {
  const { data, isLoading, isError, error, refetch } = useAnalytics()
  const [history, setHistory] = useState<TimeSeriesDataPoint[]>([])
  const prevDataRef = useRef<SystemAnalyticsSnapshot | null>(null)

  const addDataPoint = useCallback((snapshot: SystemAnalyticsSnapshot) => {
    const now = new Date()
    const timeStr = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })

    setHistory((prev) => {
      const newPoint: TimeSeriesDataPoint = {
        time: timeStr,
        cpu: snapshot.cpu_percent,
        memory: snapshot.memory_percent,
        disk: snapshot.disk_percent,
      }
      const updated = [...prev, newPoint]
      if (updated.length > MAX_DATA_POINTS) {
        return updated.slice(-MAX_DATA_POINTS)
      }
      return updated
    })
  }, [])

  useEffect(() => {
    if (data && data !== prevDataRef.current) {
      addDataPoint(data)
      prevDataRef.current = data
    }
  }, [data, addDataPoint])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-xl font-semibold">Analytics</h2>
        <p className="text-sm text-muted-foreground">
          Real-time system resource monitoring
        </p>
      </div>

      {isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load analytics</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span>{getErrorMessage(error)}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit shrink-0"
              onClick={() => void refetch()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCardSkeleton />
            <ChartCardSkeleton />
            <ChartCardSkeleton />
          </div>
        </>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="System Uptime"
              value={formatUptime(data.boot_time)}
              subtitle="Since last boot"
              icon={Time01Icon}
            />
            <MetricCard
              title="Processes"
              value={data.process_count.toLocaleString()}
              subtitle="Running processes"
              icon={Settings02Icon}
            />
            <MetricCard
              title="Network Sent"
              value={formatBytes(data.network_bytes_sent)}
              subtitle="Total since boot"
              icon={RssConnectedIcon}
            />
            <MetricCard
              title="Network Received"
              value={formatBytes(data.network_bytes_recv)}
              subtitle="Total since boot"
              icon={RssConnectedIcon}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard
              title="CPU Usage"
              description="Processor utilization over time"
              currentValue={`${data.cpu_percent.toFixed(1)}%`}
              data={history}
              dataKey="cpu"
              config={cpuChartConfig}
              icon={CpuIcon}
            />
            <ChartCard
              title="Memory Usage"
              description={`${formatBytes(data.memory_used_bytes)} of ${formatBytes(data.memory_total_bytes)}`}
              currentValue={`${data.memory_percent.toFixed(1)}%`}
              data={history}
              dataKey="memory"
              config={memoryChartConfig}
              icon={Database01Icon}
            />
            <ChartCard
              title="Disk Usage"
              description={`${formatBytes(data.disk_used_bytes)} of ${formatBytes(data.disk_total_bytes)}`}
              currentValue={`${data.disk_percent.toFixed(1)}%`}
              data={history}
              dataKey="disk"
              config={diskChartConfig}
              icon={HardDriveIcon}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <HugeiconsIcon
                    icon={CpuIcon}
                    className="size-4 text-muted-foreground"
                  />
                  <CardTitle className="text-sm font-medium">CPU</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <span
                    className={`font-heading text-3xl font-bold ${getUsageColor(data.cpu_percent)}`}
                  >
                    {data.cpu_percent.toFixed(1)}%
                  </span>
                  <span className="text-sm text-muted-foreground">
                    utilization
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <HugeiconsIcon
                    icon={Database01Icon}
                    className="size-4 text-muted-foreground"
                  />
                  <CardTitle className="text-sm font-medium">Memory</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <span
                    className={`font-heading text-3xl font-bold ${getUsageColor(data.memory_percent)}`}
                  >
                    {data.memory_percent.toFixed(1)}%
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatBytes(data.memory_used_bytes)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <HugeiconsIcon
                    icon={HardDriveIcon}
                    className="size-4 text-muted-foreground"
                  />
                  <CardTitle className="text-sm font-medium">Disk</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <span
                    className={`font-heading text-3xl font-bold ${getUsageColor(data.disk_percent)}`}
                  >
                    {data.disk_percent.toFixed(1)}%
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatBytes(data.disk_used_bytes)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  )
}
