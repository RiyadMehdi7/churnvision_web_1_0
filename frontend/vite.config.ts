import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'
import fs from 'fs'

// Get package version from package.json to ensure consistency
const getPackageVersion = () => {
  try {
    const packageJsonPath = path.resolve(__dirname, 'package.json')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    return packageJson.version || '1.0.0'
  } catch (error) {
    console.error('Error reading package.json:', error)
    return '1.0.0' // Default fallback
  }
}

// Determine if we're running in Electron
const isElectron = process.env.ELECTRON === 'true'

// Get package version
const packageVersion = getPackageVersion()
console.log(`Building frontend with version: ${packageVersion}, Electron mode: ${isElectron}`)

// Set environment variables to ensure consistency
process.env.VITE_APP_VERSION = packageVersion

// Create a version info plugin
const versionInfoPlugin: Plugin = {
  name: 'version-info',
  configureServer(server) {
    server.middlewares.use('/version-info', (req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
      res.setHeader('Surrogate-Control', 'no-store')

      // Return version information
      res.end(JSON.stringify({
        version: packageVersion,
        timestamp: new Date().toISOString(),
        nodeEnv: process.env.NODE_ENV || 'development',
        isElectron: isElectron,
        appVersion: process.env.VITE_APP_VERSION || 'not set'
      }))
    })
  }
}

// Bundle analysis mode: ANALYZE=true bun run build
const isAnalyzeMode = process.env.ANALYZE === 'true'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    versionInfoPlugin,
    // Bundle visualizer - generates stats.html when ANALYZE=true
    ...(isAnalyzeMode
      ? [
          visualizer({
            filename: 'dist/stats.html',
            open: true,
            gzipSize: true,
            brotliSize: true,
            template: 'treemap', // treemap, sunburst, or network
          }),
        ]
      : []),
  ],
  // Set base path for Electron vs web builds
  base: isElectron ? './' : '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@services': path.resolve(__dirname, './src/services'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@styles': path.resolve(__dirname, './src/styles'),
      '@assets': path.resolve(__dirname, './src/assets'),
      '@types': path.resolve(__dirname, './src/types'),
      '@config': path.resolve(__dirname, './src/config'),
      '@shared': path.resolve(__dirname, '../../packages/shared')
    }
  },
  server: {
    port: 4001,
    strictPort: true,
    host: true,
    hmr: {
      // Ensure HMR works in both web and Electron environments
      protocol: 'ws',
      host: 'localhost',
      port: 4001,
      clientPort: 3000,
      overlay: true,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path
      }
    },
    // Ensure proper shutdown
    watch: {
      usePolling: false,
    },
    // Add middleware to handle proper shutdown
    middlewareMode: false
  },
  // Define environment variables for both Electron and browser
  define: {
    // Ensure consistent environment variables
    'import.meta.env.VITE_IS_ELECTRON': isElectron,
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageVersion),
    // Enable service worker only in production (disable in dev to prevent caching issues)
    'import.meta.env.VITE_DISABLE_SW': process.env.NODE_ENV !== 'production'
  },
  // Configure build options
  build: {
    // Source maps only in development
    sourcemap: process.env.NODE_ENV !== 'production',
    // Optimize for the correct environment
    target: isElectron ? 'chrome100' : 'esnext',
    // Disable service worker generation in production build
    manifest: false,
    // Ensure clean builds
    emptyOutDir: true,
    // Chunk size warning limit (500kb)
    chunkSizeWarningLimit: 500,
    // Minification options
    minify: 'terser',
    terserOptions: {
      compress: {
        // Remove console.log in production
        drop_console: process.env.NODE_ENV === 'production',
        drop_debugger: true,
        // Remove dead code
        dead_code: true,
        // Optimize conditionals
        conditionals: true,
        // Remove unused code
        unused: true,
      },
      mangle: {
        safari10: true,
      },
      format: {
        comments: false,
      },
    },
    // Configure rollup options for better code splitting
    // Consolidated from 8 chunks to 4 to reduce HTTP overhead while maintaining cacheability
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // Core framework (React + TanStack) - these load together on every page
            if (
              id.includes('react') ||
              id.includes('react-dom') ||
              id.includes('react-router') ||
              id.includes('@tanstack')
            ) {
              return 'vendor-core';
            }
            // UI libraries (components, animations, charts, icons) - visual layer
            if (
              id.includes('@radix-ui') ||
              id.includes('@headlessui') ||
              id.includes('framer-motion') ||
              id.includes('recharts') ||
              id.includes('d3') ||
              id.includes('lucide') ||
              id.includes('@heroicons') ||
              id.includes('@ant-design/icons')
            ) {
              return 'vendor-ui';
            }
            // Utilities (forms, validation, dates, export) - helper functionality
            if (
              id.includes('react-hook-form') ||
              id.includes('zod') ||
              id.includes('@hookform') ||
              id.includes('date-fns') ||
              id.includes('jspdf') ||
              id.includes('html2canvas') ||
              id.includes('exceljs')
            ) {
              return 'vendor-utils';
            }
            // Everything else
            return 'vendor-misc';
          }
        },
        // Optimize chunk file names
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      '@tanstack/react-router',
      'recharts',
      'zustand',
    ],
    exclude: ['@playwright/test'],
  },
  // Enable experimental features for better performance
  esbuild: {
    // Drop console in production
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    // Legal comments
    legalComments: 'none',
  },
}) 
