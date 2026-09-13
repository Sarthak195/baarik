#!/usr/bin/env node
/**
 * Fail the build before the repository approaches the contest's 10 MB limit.
 *
 * The limit applies to the clone, which means git HISTORY counts and not merely the
 * working tree. A large file committed on day three and deleted on day five still
 * puts the repository over, and the only cure at that point is rewriting history and
 * losing the commit trail. Failing early at 9 MB leaves room to notice and react.
 */

import { execFileSync } from 'node:child_process';

const LIMIT_BYTES = 9 * 1024 * 1024;
const LARGEST_TO_REPORT = 10;

/** @param {string[]} args */
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

const countOutput = git(['count-objects', '-v']);
const sizePackKb = Number(/size-pack: (\d+)/.exec(countOutput)?.[1] ?? '0');
const looseKb = Number(/size: (\d+)/.exec(countOutput)?.[1] ?? '0');
const totalBytes = (sizePackKb + looseKb) * 1024;

const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

if (totalBytes > LIMIT_BYTES) {
  console.error(`Repository is ${megabytes(totalBytes)}, over the ${megabytes(LIMIT_BYTES)} guard.`);
  console.error('The contest limit is 10 MB and applies to history, not just HEAD.\n');
  console.error('Largest objects in history:');

  // Blob sizes across every reachable object, so a deleted-but-committed file shows up.
  const revList = git(['rev-list', '--objects', '--all']);
  const sizes = git([
    'cat-file',
    '--batch-check=%(objecttype) %(objectname) %(objectsize) %(rest)',
    '--batch-all-objects',
  ]);

  const pathByOid = new Map(
    revList
      .split('\n')
      .map((line) => line.split(' '))
      .filter((parts) => parts.length > 1)
      .map((parts) => [parts[0], parts.slice(1).join(' ')]),
  );

  const blobs = sizes
    .split('\n')
    .map((line) => line.split(' '))
    .filter((parts) => parts[0] === 'blob')
    .map((parts) => ({ oid: parts[1] ?? '', bytes: Number(parts[2] ?? '0') }))
    .sort((left, right) => right.bytes - left.bytes)
    .slice(0, LARGEST_TO_REPORT);

  for (const blob of blobs) {
    console.error(`  ${megabytes(blob.bytes).padStart(9)}  ${pathByOid.get(blob.oid) ?? blob.oid}`);
  }

  process.exit(1);
}

console.log(`Repository is ${megabytes(totalBytes)}, within the ${megabytes(LIMIT_BYTES)} guard.`);
