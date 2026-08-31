import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-emerald-950 text-white shadow-sm hover:bg-emerald-900 focus-visible:ring-emerald-950',
  secondary:
    'border border-emerald-950/15 bg-white text-emerald-950 shadow-sm hover:bg-emerald-50 focus-visible:ring-emerald-950',
  ghost: 'text-emerald-950 hover:bg-emerald-950/5 focus-visible:ring-emerald-950',
}

export function Button({ className, variant = 'primary', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        className,
      )}
      type={type}
      {...props}
    />
  )
}
