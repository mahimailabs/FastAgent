import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide',
  {
    variants: {
      variant: {
        default: 'border-[#4f5ca6] bg-[#1d2459] text-[#bfc8f8]',
        success: 'border-[#2a8d74] bg-[#0e5442] text-[#75f8d3]',
        warning: 'border-[#5e4a9a] bg-[#2f2f78] text-[#cfd7ff]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
