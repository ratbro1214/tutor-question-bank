import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vinext checks multipart API requests during progressive-action dispatch.
  // Allow the 40MB paper file plus multipart headers and form fields.
  experimental: { serverActions: { bodySizeLimit: "42mb" } },
};

export default nextConfig;
