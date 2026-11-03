// Set the app version from a release tag such as v1.2.3.
// A tag like v.1.1.1 is rejected so it cannot publish installers.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TAG_PATTERN = /^v(\d+\.\d+\.\d+)$/;

export function versionFromTag(tag) {
  const match = TAG_PATTERN.exec(tag);
  if (!match) {
    throw new Error(`Tag '${tag}' is not a release tag. Use v1.2.3 with no extra dots.`);
  }
  return match[1];
}

function replaceOnce(path, pattern, replacement) {
  const text = readFileSync(path, 'utf8');
  if (!pattern.test(text)) {
    throw new Error(`No version field matched in ${path}`);
  }
  writeFileSync(path, text.replace(pattern, replacement));
}

export function stampReleaseVersion(tag, root = process.cwd()) {
  const version = versionFromTag(tag);

  replaceOnce(
    join(root, 'package.json'),
    /"version": "\d+\.\d+\.\d+"/,
    `"version": "${version}"`,
  );

  replaceOnce(
    join(root, 'package-lock.json'),
    /("name": "simple-author",\n  "version": ")[^"]+"/,
    `$1${version}"`,
  );
  replaceOnce(
    join(root, 'package-lock.json'),
    /("": \{\n {6}"name": "simple-author",\n {6}"version": ")[^"]+"/,
    `$1${version}"`,
  );

  replaceOnce(
    join(root, 'src-tauri/tauri.conf.json'),
    /"version": "\d+\.\d+\.\d+"/,
    `"version": "${version}"`,
  );

  replaceOnce(
    join(root, 'src-tauri/Cargo.toml'),
    /^version = "[^"]+"/m,
    `version = "${version}"`,
  );

  replaceOnce(
    join(root, 'src-tauri/Cargo.lock'),
    /(name = "simple-author"\n)version = "[^"]+"/,
    `$1version = "${version}"`,
  );

  return version;
}

const isMain = process.argv[1] && process.argv[1].endsWith('stamp-release-version.mjs');
if (isMain) {
  const tag = process.argv[2];
  const root = process.argv.slice(3).find((arg) => arg !== '--check');
  if (!tag) {
    console.error('Usage: node scripts/stamp-release-version.mjs v1.2.3 [directory] [--check]');
    process.exit(2);
  }
  try {
    if (process.argv.includes('--check')) {
      console.log(versionFromTag(tag));
    } else {
      const version = stampReleaseVersion(tag, root);
      console.log(`Stamped ${version} from ${tag}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
