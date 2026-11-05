// Type-checks TypeScript examples in the docs that import the SDK, so examples cannot drift from it.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'packages/sdk/.docs-check');

function markdownFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

const files = [path.join(root, 'README.md'), path.join(root, 'packages/sdk/README.md'), ...markdownFiles(path.join(root, 'docs'))];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let count = 0;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  for (const match of text.matchAll(/```(?:ts|typescript)\n([\s\S]*?)```/g)) {
    if (!match[1].includes("from '@gami.fied/sdk'")) continue;
    count++;
    const name = `${path.relative(root, file).replace(/[^a-zA-Z0-9]/g, '_')}_${count}.ts`;
    const code = match[1].replaceAll("'@gami.fied/sdk'", "'../src/index.js'");
    fs.writeFileSync(path.join(outDir, name), `export {};\n${code}`);
  }
}

fs.writeFileSync(
  path.join(outDir, 'tsconfig.json'),
  JSON.stringify({
    extends: '../../../tsconfig.json',
    compilerOptions: {
      noEmit: true,
      rootDir: '..',
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      types: ['node'],
    },
    include: ['./*.ts'],
  })
);

try {
  execFileSync('pnpm', ['exec', 'tsc', '-p', outDir], {
    cwd: path.join(root, 'packages/sdk'),
    stdio: 'inherit',
    shell: true,
  });
  console.log(`Checked ${count} documentation examples.`);
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
