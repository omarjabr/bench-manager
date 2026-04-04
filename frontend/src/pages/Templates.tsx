import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"

export default function Templates() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-heading text-xl font-semibold">Templates</h2>
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          New Template
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">No templates yet</p>
    </div>
  )
}
