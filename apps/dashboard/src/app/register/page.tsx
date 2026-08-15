'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
import { Sparkles, UserPlus } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Redirect to dashboard if user is already authenticated
  useEffect(() => {
    if (!isPending && session) {
      router.replace('/dashboard');
    }
  }, [session, isPending, router]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await authClient.signUp.email({
        name,
        email,
        password,
      });

      if (res.error) {
        setError(res.error.message || 'Registration failed');
      } else {
        router.replace('/dashboard');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'An error occurred during registration');
    } finally {
      setLoading(false);
    }
  };

  if (isPending || session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-400 text-xs">
        Loading session...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-950 text-zinc-100">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Logo Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-none bg-orange-500 items-center justify-center text-white">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 font-mono">
            Create Gami Account
          </h1>
          <p className="text-xs text-zinc-400">Set up your gamification control center</p>
        </div>

        <Card className="bg-zinc-900/90 border-zinc-800 shadow-xl">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Register Dashboard Account</CardTitle>
            <CardDescription>Enter your details to create your admin user</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRegister} className="space-y-4">
              {error && (
                <div className="p-3 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-none font-medium">
                  {error}
                </div>
              )}

              <Input
                label="Full Name"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />

              <Input
                label="Work Email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <Button type="submit" variant="primary" isLoading={loading} className="w-full">
                <UserPlus className="w-4 h-4" />
                Register & Access Dashboard
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center text-xs text-zinc-400">
            Already have an account?{' '}
            <Link href="/login" className="text-orange-400 hover:underline font-semibold ml-1">
              Sign in here
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
