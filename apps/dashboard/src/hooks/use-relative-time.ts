/**
 * Formats a date/ISO string as a human-readable relative time string.
 * Examples: "just now", "5 minutes ago", "3 hours ago", "2 days ago", "Jan 5, 2024"
 */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return 'Never';

  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();

  if (diffMs < 0) return formatTimeUntil(d);

  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSecs < 10) return 'just now';
  if (diffSecs < 60) return `${diffSecs} seconds ago`;
  if (diffMins === 1) return '1 minute ago';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks === 1) return '1 week ago';
  if (diffWeeks < 5) return `${diffWeeks} weeks ago`;
  if (diffMonths === 1) return '1 month ago';
  if (diffMonths < 12) return `${diffMonths} months ago`;

  return d.toLocaleDateString();
}

/** "in 5 hours", for a moment that has not happened yet. A past moment reads as "now". */
export function formatTimeUntil(date: string | Date | null | undefined): string {
  if (!date) return 'never';
  const target = typeof date === 'string' ? new Date(date) : date;
  const minutes = Math.round((target.getTime() - Date.now()) / 60_000);
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}
