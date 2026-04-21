import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Human-readable relative time for ISO timestamps, or "Never used" when absent.
 */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === "") {
    return "Never used"
  }
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) {
    return "Never used"
  }
  const now = Date.now()
  let diffMs = now - then
  if (diffMs < 0) {
    diffMs = 0
  }
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) {
    return "just now"
  }
  const min = Math.floor(sec / 60)
  if (min < 60) {
    return `${min} minute${min === 1 ? "" : "s"} ago`
  }
  const hr = Math.floor(min / 60)
  if (hr < 24) {
    return `${hr} hour${hr === 1 ? "" : "s"} ago`
  }
  const day = Math.floor(hr / 24)
  if (day < 7) {
    return `${day} day${day === 1 ? "" : "s"} ago`
  }
  const week = Math.floor(day / 7)
  if (week < 5) {
    return `${week} week${week === 1 ? "" : "s"} ago`
  }
  const month = Math.floor(day / 30)
  if (month < 12) {
    return `${month} month${month === 1 ? "" : "s"} ago`
  }
  const year = Math.floor(day / 365)
  return `${year} year${year === 1 ? "" : "s"} ago`
}
