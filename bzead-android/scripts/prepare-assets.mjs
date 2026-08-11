#!/usr/bin/env node
/**
 * Prepare the buyer build output before `npx cap copy` runs.
 * Removes files that should never be bundled into the native Android app,
 * such as the previous release AAB download (90 MB+).
 */
import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_BUYER = path.resolve(__dirname, '../../Bzeadstore-main/dist-buyer');

const TO_REMOVE = [
  path.join(DIST_BUYER, 'download', 'bzead.aab'),
];

async function main() {
  for (const file of TO_REMOVE) {
    if (existsSync(file)) {
      await rm(file, { force: true });
      console.log(`🗑️  Removed from bundle: ${path.relative(DIST_BUYER, file)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
