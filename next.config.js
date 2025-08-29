/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Non fermare la build per errori ESLint
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
