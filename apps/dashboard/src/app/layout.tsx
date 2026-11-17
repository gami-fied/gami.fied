import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { Space_Grotesk, Space_Mono } from 'next/font/google';
import { ConfirmProvider } from '@/components/ui/confirm';
import { QueryProvider } from '@/components/ui/query-provider';
import { ToastProvider } from '@/components/ui/toast';
import { THEME_SCRIPT } from '@/components/layout/theme-toggle';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-space-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Gami.Fied Dashboard',
  description: 'Self-hosted gamification for your app',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Set by proxy.ts for each request. The theme script runs before the page paints, so it is inline
  // and needs the nonce the Content-Security-Policy asks for.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${spaceMono.variable} dark`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="font-sans min-h-screen bg-zinc-950 text-zinc-100 antialiased selection:bg-brand-500/30 selection:text-brand-100">
        <QueryProvider>
          <ToastProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
