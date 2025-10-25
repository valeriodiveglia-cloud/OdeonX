/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Forza tutti a usare UNA sola build di yjs (ESM),
  // anche se qualche pacchetto chiede la CJS.
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),

      // Qualsiasi import "yjs" → la versione ESM
      'yjs': path.resolve(__dirname, 'node_modules/yjs/dist/yjs.mjs'),

      // E se qualche lib tenta di prendere la CJS, reindirizziamo comunque alla ESM
      'yjs/dist/yjs.cjs': path.resolve(__dirname, 'node_modules/yjs/dist/yjs.mjs'),
    };
    return config;
  },

  // (opzionale ma consigliato) transpila superdoc per evitare dual-build strane in dev
  transpilePackages: ['superdoc'],
};

module.exports = nextConfig;