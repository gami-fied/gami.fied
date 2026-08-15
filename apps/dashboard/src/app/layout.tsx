import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Space_Grotesk, Space_Mono } from 'next/font/google';
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
  title: 'Gami-fied Dashboard',
  description: 'Gamification Infrastructure Control Center',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${spaceMono.variable} dark`}>
      <body className="font-sans min-h-screen bg-zinc-950 text-zinc-100 antialiased selection:bg-orange-500/30 selection:text-orange-100">
        {children}
      </body>
    </html>
  );
}
