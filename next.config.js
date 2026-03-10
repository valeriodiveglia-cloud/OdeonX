/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  // RIMOSSO eslint (non più supportato da Next 16)

  turbopack: {
    resolveAlias: {
      'yjs': path.resolve(__dirname, 'node_modules/yjs/dist/yjs.mjs'),
      'yjs/dist/yjs.cjs': path.resolve(__dirname, 'node_modules/yjs/dist/yjs.mjs'),
    },
  },

  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'yjs': path.resolve(__dirname, 'node_modules/yjs/dist/yjs.mjs'),
      'yjs/dist/yjs.cjs': path.resolve(__dirname, 'node_modules/yjs/dist/yjs.mjs'),
    }
    return config
  },

  transpilePackages: ['superdoc'],
}

module.exports = nextConfig
