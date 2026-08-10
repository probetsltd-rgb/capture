import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB, too low for the /upload Server Action (up to 60
      // WhatsApp export files per submission — see MAX_FILES_PER_UPLOAD /
      // MAX_FILE_SIZE_BYTES in src/lib/file-validation.ts). 20MB comfortably
      // fits realistic legitimate batches while still being far below the
      // worst-case 60x5MB ceiling those per-file/count checks allow —
      // this is the framework-level DoS backstop, not the primary
      // validation (that's file-validation.ts, which gives a clean error
      // instead of a raw framework crash for anything under this limit).
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
