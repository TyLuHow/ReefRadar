import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { ToastProvider } from '@/components/Toast';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

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
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-1">
              {children}
            </main>
            <footer className="border-t border-gray-200 py-6 mt-auto">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <p className="text-center text-sm text-gray-500">
                  ReefRadar - Coral Reef Acoustic Health Analysis
                </p>
              </div>
            </footer>
          </div>
          <ToastProvider />
        </Providers>
      </body>
    </html>
  );
}
