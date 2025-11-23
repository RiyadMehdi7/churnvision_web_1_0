import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
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

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    versionInfoPlugin
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
      clientPort: 4001,
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
    // Disable service worker in development to prevent offline caching issues
    'import.meta.env.VITE_DISABLE_SW': true
  },
  // Configure build options
  build: {
    // Ensure source maps for better debugging
    sourcemap: true,
    // Optimize for the correct environment
    target: isElectron ? 'chrome100' : 'esnext',
    // Disable service worker generation in production build
    manifest: false,
    // Ensure clean builds
    emptyOutDir: true,
    // Configure rollup options
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['framer-motion', 'lucide-react', 'clsx', 'tailwind-merge']
        }
      }
    }
  }
}) 
