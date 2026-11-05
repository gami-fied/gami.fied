import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Space_Grotesk, Space_Mono } from 'next/font/google';
import { ConfirmProvider } from '@/components/ui/confirm';
import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Gami.Fied Dashboard',
  description: 'Self-hosted gamification for your app',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${spaceMono.variable} dark`}>
      <body className="font-sans min-h-screen bg-zinc-950 text-zinc-100 antialiased selection:bg-orange-500/30 selection:text-orange-100">
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
