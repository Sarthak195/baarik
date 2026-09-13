import type { NextConfig } from 'next';

/**
 * Deliberately close to empty.
 *
 * The target reader is on a cheap Android over patchy mobile data, so every byte the
 * framework can be talked out of sending is a byte that does not have to arrive. That
 * argues for fewer features here, not more: no image optimiser (the report renders
 * extracted text, never page images), no rewrites, no custom webpack step.
 *
 * `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` are deliberately NOT
 * set. A build that succeeds while the type checker fails is a build that lies.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,

  // The header advertises the framework and version to anyone scanning, and buys the
  // reader nothing.
  poweredByHeader: false,
};

export default nextConfig;
