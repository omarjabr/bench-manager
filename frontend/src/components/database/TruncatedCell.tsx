import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const MAX_LEN = 80

type TruncatedCellProps = {
  text: string
  className?: string
}

export function TruncatedCell({ text, className }: TruncatedCellProps) {
  const needsTip = text.length > MAX_LEN
  const shown = needsTip ? `${text.slice(0, MAX_LEN)}…` : text

  if (!needsTip) {
    return (
      <span className={cn("block max-w-[min(20rem,100%)] truncate", className)}>
        {shown}
      </span>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "block max-w-[min(20rem,100%)] cursor-default truncate",
            className
          )}
        >
          {shown}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-md whitespace-pre-wrap break-all">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}
