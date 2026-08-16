'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Mail, ArrowRight, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export default function VerifyEmailPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // Check OTP status on mount
  useEffect(() => {
    fetchOtpStatus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const fetchOtpStatus = async () => {
    try {
      const res = await fetch('/api/auth/otp/status');
      if (res.ok) {
        const data = await res.json();
        setUserEmail(data.userEmail || '');
        if (data.emailVerified || !data.requireEmailOtpVerification) {
          // If already verified or OTP not enforced, go straight to dashboard
          router.push('/dashboard');
        }
      }
    } catch {
      // Ignore
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError('Please enter a valid 6-digit OTP code');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      if (res.ok) {
        setSuccess('Email address verified successfully! Redirecting...');
        setTimeout(() => {
          router.push('/dashboard');
        }, 1200);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Invalid or expired OTP code');
      }
    } catch {
      setError('Network error verifying OTP code');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setResending(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        setSuccess('A new 6-digit OTP code has been sent to your email.');
        setCooldown(30);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to resend OTP code');
      }
    } catch {
      setError('Network error sending OTP email');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 font-mono text-zinc-100">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-cyan-950/60 border border-cyan-700/80 text-cyan-400 flex items-center justify-center mx-auto shadow-lg">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-white uppercase tracking-wider">
            Email OTP Verification
          </h1>
          <p className="text-xs text-zinc-400">
            A 6-digit verification code was sent to{' '}
            <span className="text-cyan-400 font-bold">{userEmail || 'your registered email'}</span>.
          </p>
        </div>

        {error && (
          <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-4 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-white">
                Enter 6-Digit Code
              </CardTitle>
              <Badge variant="cyan">Transactional Security</Badge>
            </div>
            <CardDescription>
              Code expires in 15 minutes. Check your spam/junk folder if not received.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
                  6-Digit OTP Code *
                </label>
                <Input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className="text-center font-bold text-lg tracking-[8px] uppercase focus:border-cyan-500"
                />
              </div>

              <Button
                type="submit"
                disabled={loading || code.length !== 6}
                variant="cyan"
                className="w-full flex items-center justify-center gap-2"
              >
                <span>{loading ? 'Verifying...' : 'Verify OTP & Continue'}</span>
                <ArrowRight className="w-4 h-4" />
              </Button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending || cooldown > 0}
                  className="text-xs text-zinc-400 hover:text-cyan-400 disabled:opacity-40 transition flex items-center justify-center gap-1.5 mx-auto"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
                  {cooldown > 0 ? `Resend Code in ${cooldown}s` : 'Resend OTP Verification Email'}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="text-center text-[10px] text-zinc-600">
          Gami.Fied Engine Security &amp; Identity Verification Subsystem
        </div>
      </div>
    </div>
  );
}
