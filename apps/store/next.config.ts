import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: true,
  // Without this, Next 308-redirects /api/... to /api/.../ and drops the
  // POST/PUT body, breaking every mutation (incl. signin). Serve both forms.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
