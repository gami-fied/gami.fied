// Sends events to a running stack and reports how fast it accepts them, how long the worker takes
// to process them, and how fast the leaderboard answers. Run it against a stack you can afford to
// fill with synthetic users, never against production data.
//
//   API_URL=http://localhost:3001 API_KEY=gami_live_... node scripts/load-test.mjs
//
// Optional: EVENTS=5000 CONCURRENCY=50 USERS=1000 EVENT_NAME=load_test
// Add a rule that awards XP for `load_test` first, or the processing step has nothing to wait for.

const api = process.env.API_URL ?? 'http://localhost:3001';
const key = process.env.API_KEY;
const total = Number(process.env.EVENTS ?? 2000);
const concurrency = Number(process.env.CONCURRENCY ?? 25);
const users = Number(process.env.USERS ?? 500);
const eventName = process.env.EVENT_NAME ?? 'load_test';
const run = Date.now().toString(36);

if (!key) {
  console.error('Set API_KEY to a project API key.');
  process.exit(2);
}

const headers = { 'x-api-key': key, 'content-type': 'application/json' };

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function summary(label, samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const fmt = (n) => `${n.toFixed(0)} ms`;
  console.log(
    `${label.padEnd(22)} p50 ${fmt(percentile(sorted, 50))}  p95 ${fmt(percentile(sorted, 95))}  p99 ${fmt(percentile(sorted, 99))}  max ${fmt(sorted.at(-1) ?? 0)}`
  );
}

async function ingest() {
  const latencies = [];
  let failed = 0;
  let next = 0;

  const worker = async () => {
    while (next < total) {
      const index = next++;
      const started = performance.now();
      try {
        const res = await fetch(`${api}/v1/events`, {
          method: 'POST',
          headers: { ...headers, 'idempotency-key': `${run}-${index}` },
          body: JSON.stringify({ event: eventName, user_id: `lt_${run}_${index % users}`, payload: { n: index } }),
        });
        await res.arrayBuffer();
        if (res.status !== 202 && res.status !== 200) failed++;
      } catch {
        failed++;
      }
      latencies.push(performance.now() - started);
    }
  };

  const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const seconds = (performance.now() - started) / 1000;
  return { latencies, failed, seconds };
}

async function leaderboard(requests) {
  const latencies = [];
  for (let i = 0; i < requests; i++) {
    const started = performance.now();
    const res = await fetch(`${api}/v1/leaderboard?limit=20`, { headers });
    await res.arrayBuffer();
    latencies.push(performance.now() - started);
  }
  return latencies;
}

console.log(`Sending ${total} events to ${api} with ${concurrency} at a time, over ${users} users`);
const { latencies, failed, seconds } = await ingest();

console.log(`\nIngestion: ${(total / seconds).toFixed(1)} events/s, ${failed} failed, ${seconds.toFixed(1)} s total`);
summary('Accept latency', latencies);

// The first user's balance only moves once the worker has handled their events, so poll it.
const probe = `lt_${run}_0`;
const expected = Math.ceil(total / users);
const waitStarted = performance.now();
let processed = false;
for (let attempt = 0; attempt < 600 && !processed; attempt++) {
  const res = await fetch(`${api}/v1/users/${probe}/xp`, { headers });
  if (res.ok) {
    const body = await res.json();
    const xp = body.total_xp ?? body.totalXp ?? body.data?.total_xp ?? 0;
    processed = xp > 0 && expected > 0;
  }
  if (!processed) await new Promise((resolve) => setTimeout(resolve, 500));
}
const drain = (performance.now() - waitStarted) / 1000;
console.log(
  processed
    ? `\nWorker: first user's XP appeared ${drain.toFixed(1)} s after the last event was accepted`
    : '\nWorker: no XP appeared within 5 minutes. Check that a rule awards XP for this event.'
);

console.log('');
summary('Leaderboard top 20', await leaderboard(50));
if (failed > 0) process.exitCode = 1;
