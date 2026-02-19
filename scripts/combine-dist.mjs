#!/usr/bin/env node
import { cpSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const appsDir = resolve(root, 'apps');
const out = resolve(root, 'dist/CaLab');

mkdirSync(out, { recursive: true });

const apps = readdirSync(appsDir)
  .filter((name) => {
    if (name === '_template') return false;
    const dir = join(appsDir, name);
    if (!statSync(dir).isDirectory()) return false;
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
      return pkg.calab?.displayName != null;
    } catch {
      return false;
    }
  })
  .map((name) => {
    const pkg = JSON.parse(readFileSync(join(appsDir, name, 'package.json'), 'utf-8'));
    return {
      dir: name,
      displayName: pkg.calab.displayName,
      description: pkg.calab.description ?? '',
    };
  });

for (const app of apps) {
  const src = resolve(appsDir, app.dir, 'dist');
  cpSync(src, resolve(out, app.displayName), { recursive: true });
}

const listItems = apps
  .map(
    (app) =>
      `    <li><a href="${app.displayName}/">${app.displayName}</a> — ${app.description}</li>`,
  )
  .join('\n');

writeFileSync(
  resolve(out, 'index.html'),
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CaLab</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 80px auto; color: #1a1a1a; }
    a { color: #2171b5; }
    ul { list-style: none; padding: 0; }
    li { margin: 12px 0; }
  </style>
</head>
<body>
  <h1>CaLab</h1>
  <p>Calcium imaging analysis tools</p>
  <ul>
${listItems}
  </ul>
</body>
</html>
`,
);

console.log(`Combined dist created at dist/CaLab/ (${apps.length} apps)`);
