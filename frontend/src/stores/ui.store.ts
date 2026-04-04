import { create } from "zustand"

export const UI_THEME_STORAGE_KEY = "bench-manager-theme"

type Theme = "light" | "dark"

type UiState = {
  sidebarOpen: boolean
  toggleSidebar: () => void
  theme: Theme
  setTheme: (theme: Theme) => void
  activeBenchName: string | null
  setActiveBench: (name: string | null) => void
}

function readStoredTheme(): Theme {
  try {
    const value = localStorage.getItem(UI_THEME_STORAGE_KEY)
    if (value === "light" || value === "dark") return value
  } catch {
    /* localStorage may be unavailable */
  }
  return "dark"
}

function applyThemeToDocument(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark")
}

function getInitialSidebarOpen(): boolean {
  if (typeof window === "undefined") return true
  if (typeof window.matchMedia !== "function") return true
  return window.matchMedia("(min-width: 768px)").matches
}

const initialTheme = readStoredTheme()
applyThemeToDocument(initialTheme)

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: getInitialSidebarOpen(),
  theme: initialTheme,
  activeBenchName: null,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setTheme: (theme) => {
    applyThemeToDocument(theme)
    try {
      localStorage.setItem(UI_THEME_STORAGE_KEY, theme)
    } catch {
      /* ignore persistence failures */
    }
    set({ theme })
  },
  setActiveBench: (name) => set({ activeBenchName: name }),
}))
