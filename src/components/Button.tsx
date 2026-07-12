import React from 'react'

export type ButtonVariant = 
  | 'primary' 
  | 'secondary-light' 
  | 'secondary-dark' 
  | 'outline' 
  | 'danger' 
  | 'danger-light' 
  | 'warning' 
  | 'success'

export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: React.ComponentType<{ className?: string }>
  iconPosition?: 'left' | 'right'
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = '',
      variant = 'primary',
      size = 'md',
      icon: Icon,
      iconPosition = 'left',
      loading = false,
      disabled,
      children,
      type = 'button',
      ...props
    },
    ref
  ) => {
    // Basic transition & alignment classes
    const baseClasses = 'inline-flex items-center justify-center font-medium transition-all shadow-xs focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed shrink-0 cursor-pointer'
    
    // Variant classes matching ui-designer design system
    const variantClasses: Record<ButtonVariant, string> = {
      primary: 'bg-blue-600 hover:bg-blue-700 text-white border border-transparent shadow hover:shadow-lg',
      'secondary-light': 'bg-blue-600/15 hover:bg-blue-600/25 text-blue-600 border border-transparent',
      'secondary-dark': 'bg-slate-800 hover:bg-slate-700 text-white border border-white/10 shadow hover:shadow-lg',
      outline: 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 shadow hover:shadow-md',
      danger: 'bg-red-600 hover:bg-red-700 text-white border border-transparent shadow hover:shadow-lg',
      'danger-light': 'bg-red-50 hover:bg-red-100 text-red-600 border border-transparent',
      warning: 'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-transparent',
      success: 'bg-green-600 hover:bg-green-700 text-white border border-transparent shadow hover:shadow-lg'
    }

    // Size classes (compact vs medium vs large)
    const sizeClasses: Record<ButtonSize, string> = {
      sm: 'h-8 px-3 rounded-lg text-xs gap-1.5',
      md: 'h-10 px-4 rounded-lg text-sm gap-2',
      lg: 'h-11 px-5 rounded-xl text-sm gap-2.5'
    }

    const classes = [
      baseClasses,
      variantClasses[variant],
      sizeClasses[size],
      className
    ].join(' ')

    return (
      <button
        ref={ref}
        type={type}
        className={classes}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <div className="h-4 w-4 border-2 border-current/30 border-t-current rounded-full animate-spin shrink-0" />
        )}
        {!loading && Icon && iconPosition === 'left' && (
          <Icon className="w-4 h-4 shrink-0" />
        )}
        {children}
        {!loading && Icon && iconPosition === 'right' && (
          <Icon className="w-4 h-4 shrink-0" />
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'

export default Button
