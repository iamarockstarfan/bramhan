import React from 'react';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', children, ...props }, ref) => {
    const base =
      'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none cursor-pointer';

    const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
      primary:
        'bg-[#DC2626] text-white hover:bg-[#B91C1C] active:bg-[#991B1B] shadow-[0_1px_3px_rgba(220,38,38,0.28)]',
      secondary:
        'bg-rose-50 text-rose-900 hover:bg-rose-100 border border-rose-200',
      outline:
        'bg-white text-slate-700 border border-slate-200 hover:bg-rose-50/50 hover:border-rose-200 hover:text-slate-900',
      ghost:
        'bg-transparent text-slate-600 hover:bg-rose-50/60 hover:text-slate-900',
      danger: 'bg-rose-700 text-white hover:bg-rose-800',
    };

    const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
      sm: 'h-9 px-3.5 text-xs',
      md: 'h-10 px-4 text-sm',
      lg: 'h-11 px-5 text-sm',
    };

    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
