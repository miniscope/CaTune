#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const appsDir = resolve(root, 'apps');

const apps = readdirSync(appsDir).filter((name) => {
  if (name === '_template') return false;
  const dir = join(appsDir, name);
  if (!statSync(dir).isDirectory()) return false;
  const pkgPath = join(dir, 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.scripts?.build != null;
  } catch {
    return false;
  }
});

if (apps.length === 0) {
  console.error('No buildable apps found in apps/');
  process.exit(1);
}

console.log(`Building ${apps.length} apps: ${apps.join(', ')}`);

for (const name of apps) {
  console.log(`\nBuilding ${name}...`);
  execFileSync('npm', ['run', 'build', '-w', `apps/${name}`], {
    stdio: 'inherit',
    cwd: root,
  });
}

console.log('\nAll apps built successfully.');
