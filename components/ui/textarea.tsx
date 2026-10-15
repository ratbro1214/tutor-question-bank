import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-xl border border-[var(--color-border-subtle)] bg-white px-3.5 py-3 text-base shadow-none transition-[background-color,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] outline-none placeholder:text-slate-400 focus-visible:border-[var(--color-brand-primary)] focus-visible:ring-[3px] focus-visible:ring-[rgb(198_93_59_/_0.14)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
