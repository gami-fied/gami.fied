'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '../../lib/auth-client';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const MIN_PASSWORD_LENGTH = 8;

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await authClient.resetPassword({ newPassword: password, token: token ?? '' });
      if (res.error) {
        setError(res.error.message || 'This reset link is invalid or has expired.');
      } else {
        router.replace('/login');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return <p className="text-sm text-danger-300">This reset link is invalid or has expired.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div role="alert" className="p-3 bg-danger-950/40 border border-danger-800/60 text-danger-300 text-xs">
          {error}
        </div>
      )}
      <Input
        label="New Password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <Input
        label="Confirm New Password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
      />
      <Button type="submit" variant="primary" isLoading={loading} className="w-full">
        Set New Password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-950 text-zinc-100">
      <div className="w-full max-w-md">
        <Card className="bg-zinc-900/90 border-zinc-800 shadow-xl">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Choose a new password</CardTitle>
            <CardDescription>Signing in again will be required on all your devices.</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={null}>
              <ResetPasswordForm />
            </Suspense>
          </CardContent>
          <CardFooter className="justify-center text-xs text-zinc-400">
            <Link href="/login" className="text-brand-400 hover:underline font-semibold">
              Back to sign in
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
