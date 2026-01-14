import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Static export for GitHub Pages
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  basePath: '/mcpflare',
};

export default withMDX(config);



