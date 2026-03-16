/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Export as a static site so it can be hosted on Firebase Hosting without a Node server.
  output: "export",
  // next/image optimization requires a server; disable for static export.
  images: { unoptimized: true }
};

export default nextConfig;
