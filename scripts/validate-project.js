const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'manifest.json',
  'popup/popup.html',
  'popup/popup.css',
  'popup/popup.js',
  'content/content.js',
  'content/overlay.js',
  'content/canvas.js',
  'content/toolbar.js',
  'content/overlay.css',
  'background.js',
  'snapshot/snapshot.html',
  'snapshot/snapshot.css',
  'snapshot/snapshot.js',
  'storage/notes.js',
  'storage/README.md',
  'notes/notes.html',
  'notes/notes.css',
  'notes/notes.js',
  '.nvmrc',
  'package-lock.json',
  'README.md',
  'Dockerfile',
  'Makefile'
];

for (const relativePath of requiredFiles) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) {
  throw new Error('manifest.json must use Manifest V3');
}
if (manifest.action?.default_popup !== 'popup/popup.html') {
  throw new Error('manifest.json must point to popup/popup.html');
}
if (!manifest.content_scripts?.some((script) => script.js?.includes('content/content.js'))) {
  throw new Error('manifest.json must register content/content.js');
}
if (manifest.background?.service_worker !== 'background.js') {
  throw new Error('manifest.json must register background.js for snapshot capture.');
}
if (JSON.stringify([...(manifest.permissions || [])].sort()) !== JSON.stringify(['activeTab', 'storage'])) {
  throw new Error('Only activeTab and storage permissions are needed for the current milestone.');
}

const javascriptFiles = ['background.js'];
for (const directory of ['popup', 'content', 'snapshot', 'storage', 'notes']) {
  for (const file of fs.readdirSync(path.join(root, directory))) {
    if (file.endsWith('.js')) javascriptFiles.push(`${directory}/${file}`);
  }
}

for (const html of ['popup/popup.html', 'snapshot/snapshot.html', 'notes/notes.html']) {
  const text = fs.readFileSync(path.join(root, html), 'utf8');
  for (const match of text.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)) {
    if (!fs.existsSync(path.resolve(root, path.dirname(html), match[1]))) {
      throw new Error(`Missing local resource in ${html}: ${match[1]}`);
    }
  }
}

for (const relativePath of javascriptFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, relativePath)], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    throw new Error(`JavaScript syntax check failed: ${relativePath}`);
  }
}

console.log(`Validated manifest and ${javascriptFiles.length} JavaScript files.`);
