import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let useUiStore: typeof import("./ui.store").useUiStore
let UI_THEME_STORAGE_KEY: typeof import("./ui.store").UI_THEME_STORAGE_KEY

beforeEach(async () => {
  vi.resetModules()
  localStorage.clear()
  const mod = await import("./ui.store")
  useUiStore = mod.useUiStore
  UI_THEME_STORAGE_KEY = mod.UI_THEME_STORAGE_KEY
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("ui.store", () => {
  it("initial theme defaults to dark", () => {
    expect(useUiStore.getState().theme).toBe("dark")
  })

  it("setTheme updates localStorage and the dark class", () => {
    const toggleSpy = vi.spyOn(document.documentElement.classList, "toggle")
    useUiStore.getState().setTheme("light")
    expect(localStorage.getItem(UI_THEME_STORAGE_KEY)).toBe("light")
    expect(toggleSpy).toHaveBeenCalledWith("dark", false)
    useUiStore.getState().setTheme("dark")
    expect(toggleSpy).toHaveBeenCalledWith("dark", true)
  })

  it("toggleSidebar flips the boolean", () => {
    useUiStore.setState({ sidebarOpen: true })
    expect(useUiStore.getState().sidebarOpen).toBe(true)
    useUiStore.getState().toggleSidebar()
    expect(useUiStore.getState().sidebarOpen).toBe(false)
  })

  it("setActiveBench updates the name", () => {
    useUiStore.getState().setActiveBench("dev-bench")
    expect(useUiStore.getState().activeBenchName).toBe("dev-bench")
  })

  it("setActiveOperationId updates the operation id", () => {
    useUiStore.getState().setActiveOperationId("abc123")
    expect(useUiStore.getState().activeOperationId).toBe("abc123")
  })
})
