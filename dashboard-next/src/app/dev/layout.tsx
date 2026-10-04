import type { Metadata } from 'next';
import { Archivo_Black, Hanken_Grotesk, Newsreader, Spline_Sans_Mono } from 'next/font/google';

/**
 * Nested layout for every /dev route (04-06).
 *
 * The instrument typefaces are called here and nowhere else: next/font only emits the @font-face
 * rules, preload links and variable classes for the routes that render a layout calling it, so
 * legacy routes download none of these files (CONTEXT "Fonts"). Newsreader italic, Hanken Grotesk
 * and Spline Sans Mono preload on /dev; Newsreader roman and Archivo Black only load when a
 * direction that uses them paints text.
 *
 * The variable names are the ones tokens.css reads (--font-newsreader-italic, --font-newsreader-roman,
 * --font-hanken, --font-spline-mono, --font-archivo-black).
 */
const newsreaderItalic = Newsreader({
  subsets: ['latin'],
  style: 'italic',
  axes: ['opsz'],
  variable: '--font-newsreader-italic',
});

const newsreaderRoman = Newsreader({
  subsets: ['latin'],
  style: 'normal',
  axes: ['opsz'],
  variable: '--font-newsreader-roman',
  preload: false,
});

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken',
});

const splineMono = Spline_Sans_Mono({
  subsets: ['latin'],
  variable: '--font-spline-mono',
});

const archivoBlack = Archivo_Black({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-archivo-black',
  preload: false,
});

// Dev-only review surface: never indexed (vercel.json also sends X-Robots-Tag on /dev/*).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DevLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const fontVariables = [
    newsreaderItalic.variable,
    newsreaderRoman.variable,
    hanken.variable,
    splineMono.variable,
    archivoBlack.variable,
  ].join(' ');

  return <div className={fontVariables}>{children}</div>;
}
