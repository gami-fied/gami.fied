import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 p-6">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-orange-400">404</p>
        <h1 className="mt-2 text-2xl font-bold text-white">Page not found</h1>
        <p className="mt-2 text-sm text-zinc-400">
          This page doesn&apos;t exist, or it may have moved.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400"
        >
          Go to the dashboard
        </Link>
      </div>
    </main>
  );
}
