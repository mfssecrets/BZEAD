#!/usr/bin/env node
/**
 * `npx cap sync` regenerates android/app/src/main/assets/capacitor.plugins.json,
 * which drops our hand-registered local plugins. This script restores them.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGINS_FILE = path.resolve(__dirname, '../android/app/src/main/assets/capacitor.plugins.json');

const CUSTOM_PLUGINS = [
  { pkg: 'bzead-android', classpath: 'com.bzead.app.BzeadPullToRefreshPlugin' },
  { pkg: 'bzead-android', classpath: 'com.bzead.app.BzeadBackButtonPlugin' },
];

async function main() {
  const raw = await readFile(PLUGINS_FILE, 'utf8');
  const plugins = JSON.parse(raw);

  const exists = (classpath) => plugins.some((p) => p.classpath === classpath);
  let changed = false;

  for (const plugin of CUSTOM_PLUGINS) {
    if (!exists(plugin.classpath)) {
      plugins.push(plugin);
      changed = true;
    }
  }

  if (changed) {
    await writeFile(PLUGINS_FILE, JSON.stringify(plugins, null, '\t') + '\n');
    console.log('✅ Restored custom Capacitor plugins');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
