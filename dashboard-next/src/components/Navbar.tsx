'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Waves,
  LayoutDashboard,
  Upload,
  MapPin,
  GitCompare,
  Compass,
  Info,
  Headphones,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/experience', label: 'Experience', icon: Headphones },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/analyze', label: 'Analyze', icon: Upload },
  { href: '/dashboard/map', label: 'Map', icon: MapPin },
  { href: '/dashboard/compare', label: 'Compare', icon: GitCompare },
  { href: '/sites', label: 'Sites', icon: Compass },
  { href: '/about', label: 'About', icon: Info },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Dark theme on all pages
  const isDark = true;

  return (
    <nav
      className={cn(
        'sticky top-0 z-50 border-b transition-colors duration-200',
        isDark
          ? 'bg-abyss/80 backdrop-blur-md border-white/5'
          : 'bg-white border-gray-200',
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo and Brand */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <div
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center',
                  isDark ? 'bg-ochre/20' : 'bg-ochre',
                )}
              >
                <Waves className={cn('w-6 h-6', isDark ? 'text-ochre' : 'text-white')} />
              </div>
              <span
                className={cn(
                  'text-xl font-bold',
                  isDark ? 'text-white' : 'text-ochre',
                )}
              >
                ReefRadar
              </span>
            </Link>
          </div>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center space-x-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive =
                pathname === href ||
                (href !== '/' && href !== '/dashboard' && pathname.startsWith(href)) ||
                (href === '/dashboard' && pathname === '/dashboard');
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isDark
                      ? isActive
                        ? 'bg-white/10 text-white'
                        : 'text-white/60 hover:bg-white/5 hover:text-white/90'
                      : isActive
                        ? 'bg-muted-tan/20 text-ochre'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>

          {/* Mobile hamburger */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className={cn(
                'p-2 rounded-lg transition-colors',
                isDark ? 'text-white/80 hover:bg-white/10' : 'text-gray-600 hover:bg-gray-100',
              )}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div
          className={cn(
            'md:hidden border-t px-4 pb-4 pt-2 space-y-1',
            isDark ? 'bg-abyss border-white/5' : 'bg-white border-gray-200',
          )}
        >
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              pathname === href ||
              (href !== '/' && href !== '/dashboard' && pathname.startsWith(href)) ||
              (href === '/dashboard' && pathname === '/dashboard');
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center space-x-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isDark
                    ? isActive
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:bg-white/5 hover:text-white'
                    : isActive
                      ? 'bg-muted-tan/20 text-ochre'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
