import { useState } from "react"

import { TemplateCard } from "@/components/templates/TemplateCard"
import { TemplateFormDialog } from "@/components/templates/TemplateForm"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useTemplates } from "@/hooks/useTemplates"
import type { Template } from "@/lib/api"
import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

function TemplateCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 ring-1 ring-foreground/10">
      <div className="grid gap-2 px-4">
        <div className="flex justify-between gap-2">
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="border-t bg-muted/50 p-4">
        <Skeleton className="h-4 w-1/3" />
      </div>
      <div className="flex flex-wrap gap-2 border-t bg-muted/50 p-4">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
      </div>
    </div>
  )
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return "Failed to load templates"
}

export default function Templates() {
  const { data, isLoading, isError, error, refetch } = useTemplates()
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)

  const openCreate = () => {
    setFormMode("create")
    setEditingTemplate(null)
    setFormOpen(true)
  }

  const openEdit = (template: Template) => {
    setFormMode("edit")
    setEditingTemplate(template)
    setFormOpen(true)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="font-heading text-xl font-semibold">Templates</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={openCreate}
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          New Template
        </Button>
      </div>

      {isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load templates</AlertTitle>
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {["s1", "s2", "s3"].map((key) => (
            <TemplateCardSkeleton key={key} />
          ))}
        </div>
      ) : null}

      {!isLoading && !isError && (data?.length ?? 0) > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onEdit={openEdit}
            />
          ))}
        </div>
      ) : null}

      {!isLoading && !isError && data?.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="max-w-sm space-y-2">
            <p className="font-heading text-lg font-medium">No templates yet</p>
            <p className="text-muted-foreground text-sm">
              Save a bench configuration as a template to reuse it later.
            </p>
          </div>
          <Button type="button" className="gap-1.5" onClick={openCreate}>
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            New Template
          </Button>
        </div>
      ) : null}

      <TemplateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        initialTemplate={formMode === "edit" ? editingTemplate : null}
      />
    </div>
  )
}
