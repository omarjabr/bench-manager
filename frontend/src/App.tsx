import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useLayoutEffect, useState } from "react"
import { BrowserRouter, Outlet, Route, Routes, useLocation } from "react-router-dom"

import { Sidebar } from "@/components/layout/Sidebar"
import { Topbar } from "@/components/layout/Topbar"
import { Toaster } from "@/components/ui/sonner"
import { NewBenchWizard } from "@/components/wizards/NewBenchWizard"
import { cn } from "@/lib/utils"
import Analytics from "@/pages/Analytics"
import BenchDetail from "@/pages/BenchDetail"
import Dashboard from "@/pages/Dashboard"
import Database from "@/pages/Database"
import Servers from "@/pages/Servers"
import Settings from "@/pages/Settings"
import SystemCheck from "@/pages/SystemCheck"
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
  const [searchQuery, setSearchQuery] = useState("")
  const { pathname } = useLocation()
  const newBenchWizardOpen = useUiStore((s) => s.newBenchWizardOpen)
  const setNewBenchWizardOpen = useUiStore((s) => s.setNewBenchWizardOpen)
  const setWizardTemplate = useUiStore((s) => s.setWizardTemplate)

  const isDbPage = pathname === "/database"

  return (
    <div className="flex h-screen min-h-0 w-full overflow-hidden">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onNewBench={() => {
            setWizardTemplate(null)
            setNewBenchWizardOpen(true)
          }}
        />
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col p-6",
            isDbPage ? "overflow-hidden" : "overflow-y-auto"
          )}
        >
          <Outlet context={{ searchQuery, setSearchQuery }} />
        </div>
      </div>
      <NewBenchWizard
        open={newBenchWizardOpen}
        onOpenChange={setNewBenchWizardOpen}
      />
    </div>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeSync />
        <Toaster />
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/benches/:name" element={<BenchDetail />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/database" element={<Database />} />
            <Route path="/servers" element={<Servers />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/system-check" element={<SystemCheck />} />
            <Route path="/analytics" element={<Analytics />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
