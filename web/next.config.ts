import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  sassOptions: {
    additionalData: `@use '@/styles/mixins' as *;\n@use '@/styles/settings' as *;\n`,
  },
};

export default nextConfig;
