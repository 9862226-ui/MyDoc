import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 镜像里用精简的 standalone 产物；直接 npm start 时不需要
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
