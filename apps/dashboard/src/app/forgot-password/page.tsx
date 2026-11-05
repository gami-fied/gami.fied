'use client';

import { useState } from 'react';
import Link from 'next/link';
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (res.error) {
        setError(res.error.message || 'Could not start the password reset.');
      } else {
        setSent(true);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-950 text-zinc-100">
      <div className="w-full max-w-md">
        <Card className="bg-zinc-900/90 border-zinc-800 shadow-xl">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Reset your password</CardTitle>
            <CardDescription>We will email you a link to choose a new password.</CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <p className="text-sm text-zinc-300">
                If an account exists for {email}, a reset link is on its way. It expires in one
                hour.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div role="alert" className="p-3 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
                    {error}
                  </div>
                )}
                <Input
                  label="Work Email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Button type="submit" variant="primary" isLoading={loading} className="w-full">
                  Send Reset Link
                </Button>
              </form>
            )}
          </CardContent>
          <CardFooter className="justify-center text-xs text-zinc-400">
            <Link href="/login" className="text-orange-400 hover:underline font-semibold">
              Back to sign in
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
