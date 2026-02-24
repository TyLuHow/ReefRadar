import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ConditionalShell } from '@/components/layout/ConditionalShell';
import { ToastProvider } from '@/components/Toast';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'ReefRadar - Coral Reef Acoustic Health Analysis',
  description: 'AI-powered tool for analyzing coral reef health through underwater acoustic recordings',
  keywords: ['coral reef', 'acoustic analysis', 'marine biology', 'AI', 'conservation'],
  authors: [{ name: 'ReefRadar' }],
  openGraph: {
    title: 'ReefRadar - Coral Reef Acoustic Health Analysis',
    description: 'AI-powered tool for analyzing coral reef health through underwater acoustic recordings',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`scroll-smooth ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className={`${inter.className} bg-abyss text-bone`}>
        <Providers>
          <ConditionalShell>
            {children}
          </ConditionalShell>
          <ToastProvider />
        </Providers>
      </body>
    </html>
  );
}
