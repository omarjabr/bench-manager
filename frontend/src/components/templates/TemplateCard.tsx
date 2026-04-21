import { useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useDeleteTemplate, useUseTemplate } from "@/hooks/useTemplates"
import { getApiErrorMessage, type Template } from "@/lib/api"
import { formatRelativeTime } from "@/lib/utils"
import { useUiStore } from "@/stores/ui.store"
import { ArrowRight01Icon, Delete02Icon, Edit02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

type TemplateCardProps = {
  template: Template
  onEdit: (template: Template) => void
}

export function TemplateCard({ template, onEdit }: TemplateCardProps) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const deleteMutation = useDeleteTemplate()
  const useMutationHook = useUseTemplate()
  const setWizardTemplate = useUiStore((s) => s.setWizardTemplate)
  const setNewBenchWizardOpen = useUiStore((s) => s.setNewBenchWizardOpen)

  const shownApps = template.apps.slice(0, 3)
  const moreCount = template.apps.length - shownApps.length

  const handleUse = () => {
    void useMutationHook
      .mutateAsync(template.id)
      .then((updated) => {
        setWizardTemplate(updated)
        setNewBenchWizardOpen(true)
      })
      .catch((error: unknown) => {
        toast.error(getApiErrorMessage(error))
      })
  }

  const handleConfirmDelete = () => {
    void deleteMutation
      .mutateAsync(template.id)
      .then(() => {
        setDeleteOpen(false)
      })
      .catch((error: unknown) => {
        toast.error(getApiErrorMessage(error))
      })
  }

  return (
    <>
      <Card size="sm">
        <CardHeader className="gap-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="font-heading text-base leading-snug">
              {template.name}
            </CardTitle>
            <Badge variant="secondary" className="shrink-0 font-mono text-xs">
              {template.frappe_version}
            </Badge>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">
              {template.apps.length}{" "}
              {template.apps.length === 1 ? "app" : "apps"}
            </span>
            {template.apps.length === 0 ? (
              <span className="text-muted-foreground text-xs">None</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {shownApps.map((a) => (
                  <Badge
                    key={a.repo_url}
                    variant="outline"
                    className="font-normal"
                  >
                    {a.name}
                  </Badge>
                ))}
                {moreCount > 0 ? (
                  <Badge variant="outline" className="font-normal">
                    + {moreCount} more
                  </Badge>
                ) : null}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-muted-foreground text-xs">
            Last used: {formatRelativeTime(template.last_used_at)}
          </p>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2 border-t bg-muted/50">
          <Button
            type="button"
            size="sm"
            variant="default"
            className="gap-1.5"
            disabled={useMutationHook.isPending}
            onClick={() => void handleUse()}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
            Use
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => onEdit(template)}
          >
            <HugeiconsIcon icon={Edit02Icon} className="size-4" />
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5 text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            Delete
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes &quot;{template.name}&quot; permanently. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleConfirmDelete()}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
