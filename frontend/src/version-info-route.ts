// Add a route handler for version information
// This will be used by Vite's development server middleware

import fs from 'fs';
import path from 'path';

// Function to get package.json version
export function getPackageVersion() {
  try {
    // Try to read frontend package.json
    const frontendPackagePath = path.resolve(__dirname, '../../package.json');
    if (fs.existsSync(frontendPackagePath)) {
      const packageJson = JSON.parse(fs.readFileSync(frontendPackagePath, 'utf8'));
      return packageJson.version || '0.0.0';
    }

    // Fallback to environment variable or default
    return process.env.npm_package_version || '1.0.0';
  } catch (error) {
    console.error('Error reading package.json:', error);
    return '1.0.0'; // Default fallback
  }
}

// Handler for version-info endpoint
// Prefixed req with underscore as it's unused
export function versionInfoHandler(_req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  
  // Return version information
  res.end(JSON.stringify({
    version: getPackageVersion(),
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV || 'development',
    isElectron: process.env.ELECTRON === 'true',
    appVersion: process.env.VITE_APP_VERSION || 'not set'
  }));
}

export default versionInfoHandler; 