import { createMDX } from "fumadocs-mdx/next";

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  transpilePackages: [
    "@silo-storage/sdk-core",
    "@silo-storage/sdk-next",
    "@silo-storage/sdk-react",
    "@silo-storage/sdk-server",
    "@silo-storage/ui",
  ],
};

const withMDX = createMDX();

export default withMDX(config);
