'use client';

/** Replaces the root layout when it fails, so it brings its own document and plain styles. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: '#09090b', color: '#fafafa', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ maxWidth: 420, margin: '20vh auto', textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 24 }}>Gami.Fied couldn&apos;t load</h1>
          <p style={{ color: '#a1a1aa', fontSize: 14 }}>Refresh the page or try again.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
