import { useCallback, useEffect, useState } from 'react';

export interface SmtpStatus {
  configured: boolean;
  host: string | null;
  port: number;
  user: string | null;
  fromEmail: string | null;
  fromName: string;
  secure: boolean;
  passwordConfigured: boolean;
  updatedAt: string | null;
}

export function useSmtpConfig() {
  const [status, setStatus] = useState<SmtpStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/smtp');
      if (res.ok) {
        setStatus(await res.json());
        setError(null);
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to fetch SMTP configuration');
      }
    } catch {
      setError('Network error fetching SMTP config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const saveConfig = async (payload: {
    host: string;
    port: number;
    user?: string;
    password?: string;
    fromEmail: string;
    fromName?: string;
    secure?: boolean;
  }) => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/admin/smtp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setSuccessMsg(data.message || 'SMTP settings saved successfully');
        await fetchStatus();
        return true;
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to save SMTP configuration');
        return false;
      }
    } catch {
      setError('Network error saving SMTP config');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const sendTestEmail = async (recipientEmail: string) => {
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/admin/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail }),
      });

      if (res.ok) {
        const data = await res.json();
        setSuccessMsg(data.message || `Test email sent to ${recipientEmail}`);
        return true;
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to send test email');
        return false;
      }
    } catch {
      setError('Network error sending test email');
      return false;
    }
  };

  return { status, loading, error, successMsg, saveConfig, sendTestEmail, refresh: fetchStatus };
}
