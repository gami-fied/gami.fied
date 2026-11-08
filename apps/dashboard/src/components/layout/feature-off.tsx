'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { PowerOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Shown in place of a page whose feature the platform administrator has turned off. */
export function FeatureOff({ name, feature }: { name: string; feature: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      className="mx-auto mt-10 max-w-lg border border-zinc-800 bg-zinc-950/80 p-8 text-center"
    >
      <motion.div
        initial={{ scale: 0.6, rotate: -20, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 260, damping: 16 }}
        className="mx-auto mb-4 flex h-14 w-14 items-center justify-center border border-zinc-700 bg-zinc-900"
      >
        <PowerOff className="h-6 w-6 text-zinc-400" />
      </motion.div>
      <h1 className="text-lg font-bold text-zinc-100">{name} is turned off</h1>
      <p className="mt-2 text-sm text-zinc-400">
        The platform administrator has turned this feature off for your organization. Your data is kept, and everything comes back as it was if it is turned on again.
      </p>
      <p className="mt-2 text-xs text-zinc-500">
        API calls for it answer with <code>FEATURE_DISABLED</code> ({feature}).
      </p>
      <div className="mt-6 flex justify-center">
        <Link href="/dashboard">
          <Button variant="secondary" size="sm">Back to Overview</Button>
        </Link>
      </div>
    </motion.div>
  );
}
