// Times leaderboard queries on a large synthetic project, using the database's own execution time
// so network distance does not count. It seeds one project, measures, and deletes it again.
//
//   DATABASE_URL_TEST=postgresql://.../gamified_test node scripts/benchmark-leaderboards.mjs [users]
//
// It refuses to run unless the database is named gamified_test.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const postgres = createRequire(fileURLToPath(new URL('../packages/database/package.json', import.meta.url)))('postgres');

const USERS = Number(process.argv[2] || 100000);
const ORG = 'org_bench_lb';
const PRJ = 'prj_bench_lb';

try {
  const url = new URL(process.env.DATABASE_URL_TEST);
  if (url.pathname !== '/gamified_test') throw new Error('Refusing: not the test database');
  const sql = postgres(url.href, { max: 1 });
  const time = async (label, query) => {
    const rows = await sql.unsafe(`EXPLAIN (ANALYZE, BUFFERS OFF, TIMING OFF) ${query}`);
    const line = rows.map((r) => r['QUERY PLAN']).find((l) => l.startsWith('Execution Time'));
    const plan = rows.map((r) => r['QUERY PLAN']).filter((l) => /Scan|Index/.test(l)).slice(0, 3).map((l) => l.trim().slice(0, 90));
    console.log(label.padEnd(34), line.replace('Execution Time: ', ''), '|', plan.join(' ; '));
  };

  try {
    await sql`DELETE FROM organizations WHERE id = ${ORG}`;
    await sql`INSERT INTO organizations (id, name, slug) VALUES (${ORG}, 'Bench', 'bench-lb')`;
    await sql`INSERT INTO projects (id, organization_id, name, slug) VALUES (${PRJ}, ${ORG}, 'Bench', 'bench')`;
    await sql.unsafe(`INSERT INTO end_users (id, project_id, external_id, name, active)
      SELECT 'u' || g, '${PRJ}', 'ext_' || g, 'User ' || g, (g % 50 <> 0) FROM generate_series(1, ${USERS}) g`);
    await sql.unsafe(`INSERT INTO user_xp_balances (id, project_id, user_id, total_xp)
      SELECT 'b' || g, '${PRJ}', 'u' || g, (random() * 100000)::bigint FROM generate_series(1, ${USERS}) g`);
    await sql.unsafe(`INSERT INTO xp_ledger (id, project_id, user_id, amount, reason, created_at, action_index)
      SELECT 'l' || g, '${PRJ}', 'u' || (1 + (random() * ${USERS - 1})::int), (1 + random() * 100)::int, 'seed',
             now() - (random() * interval '40 days'), 0 FROM generate_series(1, ${USERS * 5}) g`);
    const [idx] = await sql`SELECT count(*)::int n FROM pg_indexes WHERE indexname = 'end_users_project_inactive_idx'`;
    console.log('inactive index present:', idx.n === 1);
    await sql`ANALYZE end_users`;
    await sql`ANALYZE user_xp_balances`;
    await sql`ANALYZE xp_ledger`;
    console.log(`seeded ${USERS} users, ${USERS * 5} ledger rows`);

    const who = `u${Math.floor(USERS / 2)}`;
    const week = `now() - interval '7 days'`;

    // Current queries
    await time('CURRENT all-time top 20', `
      WITH r AS (SELECT eu.id, ROW_NUMBER() OVER (ORDER BY COALESCE(uxb.total_xp,0) DESC, eu.id ASC)::int AS rank
        FROM end_users eu LEFT JOIN user_xp_balances uxb ON eu.id = uxb.user_id AND uxb.project_id = '${PRJ}'
        WHERE eu.project_id = '${PRJ}' AND eu.active = true AND COALESCE(uxb.total_xp,0) > 0)
      SELECT id, rank, COUNT(*) OVER()::int FROM r ORDER BY rank LIMIT 20`);
    await time('CURRENT all-time user rank', `
      WITH r AS (SELECT eu.id, ROW_NUMBER() OVER (ORDER BY COALESCE(uxb.total_xp,0) DESC, eu.id ASC)::int AS rank, COUNT(*) OVER()::int t
        FROM end_users eu LEFT JOIN user_xp_balances uxb ON eu.id = uxb.user_id AND uxb.project_id = '${PRJ}'
        WHERE eu.project_id = '${PRJ}' AND eu.active = true AND COALESCE(uxb.total_xp,0) > 0)
      SELECT * FROM r WHERE id = '${who}'`);
    await time('CURRENT weekly top 20', `
      WITH p AS (SELECT eu.id, COALESCE(SUM(xl.amount),0)::bigint xp FROM end_users eu
        LEFT JOIN xp_ledger xl ON eu.id = xl.user_id AND xl.project_id = '${PRJ}' AND xl.created_at >= ${week}
        WHERE eu.project_id = '${PRJ}' AND eu.active = true GROUP BY eu.id HAVING COALESCE(SUM(xl.amount),0) > 0),
      r AS (SELECT id, xp, ROW_NUMBER() OVER (ORDER BY xp DESC, id ASC)::int rank FROM p)
      SELECT id, xp, rank, COUNT(*) OVER()::int FROM r ORDER BY rank LIMIT 20`);

    // New queries, as shipped
    await time('SHIPPED all-time top 20', `
      SELECT b.user_id, eu.external_id, eu.name, b.total_xp FROM user_xp_balances b
      JOIN end_users eu ON eu.project_id = b.project_id AND eu.id = b.user_id
      WHERE b.project_id = '${PRJ}' AND eu.active = true AND b.total_xp > 0
      ORDER BY b.total_xp DESC, b.user_id ASC LIMIT 20 OFFSET 40`);
    await time('SHIPPED all-time total', `
      SELECT ((SELECT COUNT(*) FROM user_xp_balances WHERE project_id = '${PRJ}' AND total_xp > 0)
        - (SELECT COUNT(*) FROM end_users eu JOIN user_xp_balances b ON b.project_id = eu.project_id AND b.user_id = eu.id
            WHERE eu.project_id = '${PRJ}' AND eu.active = false AND b.total_xp > 0))::int`);
    await time('SHIPPED all-time user rank', `
      SELECT ((SELECT COUNT(*) FROM user_xp_balances WHERE project_id = '${PRJ}' AND total_xp > 0
                AND (total_xp > 50000 OR (total_xp = 50000 AND user_id < '${who}')))
        - (SELECT COUNT(*) FROM end_users eu JOIN user_xp_balances b ON b.project_id = eu.project_id AND b.user_id = eu.id
            WHERE eu.project_id = '${PRJ}' AND eu.active = false AND b.total_xp > 0
              AND (b.total_xp > 50000 OR (b.total_xp = 50000 AND b.user_id < '${who}'))))::int`);
  } finally {
    await sql`DELETE FROM organizations WHERE id = ${ORG}`;
    const [left] = await sql`SELECT count(*)::int n FROM end_users WHERE project_id = ${PRJ}`;
    console.log('cleaned up, rows left:', left.n);
    await sql.end();
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
