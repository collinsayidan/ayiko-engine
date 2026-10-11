import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The engine has its own lockfile in the parent folder; this app lives in web/.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
