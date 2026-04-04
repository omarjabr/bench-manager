import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useLayoutEffect } from "react"
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom"

import { Sidebar } from "@/components/layout/Sidebar"
import { Topbar } from "@/components/layout/Topbar"
import BenchDetail from "@/pages/BenchDetail"
import Dashboard from "@/pages/Dashboard"
import Settings from "@/pages/Settings"
import Templates from "@/pages/Templates"
import { useUiStore } from "@/stores/ui.store"

const queryClient = new QueryClient()

function ThemeSync() {
  const theme = useUiStore((s) => s.theme)
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
  }, [theme])
  return null
}

function AppShell() {
  return (
    <div className="flex min-h-screen w-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <div className="flex-1 p-6">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeSync />
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/benches/:name" element={<BenchDetail />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
