'use client';

import { cn } from '@/lib/utils';
import Link from 'next/link';
import { ButtonHTMLAttributes, ReactNode } from 'react';

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  className?: string;
  href?: string;
  variant?: 'primary' | 'ghost' | 'danger';
}

const variantStyles = {
  primary: 'glass-button text-bone',
  ghost: 'bg-transparent text-bone border border-transparent hover:bg-[var(--glass-bg)] rounded-full transition-all duration-200',
  danger: 'glass-button text-warm-amber border-warm-amber/30 hover:border-warm-amber/50',
};

export function GlassButton({
  children,
  className,
  href,
  variant = 'primary',
  ...props
}: GlassButtonProps) {
  const classes = cn(
    'inline-flex items-center justify-center px-6 py-2.5 font-medium text-sm rounded-full transition-all duration-200',
    variantStyles[variant],
    className
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
