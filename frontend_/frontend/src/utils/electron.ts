/**
 * Checks if the application is running within an Electron environment.
 * @returns {boolean} True if running in Electron, false otherwise.
 */
export const isElectron = (): boolean => {
  // Check if the Electron-specific API exposed via contextBridge exists
  return typeof window !== 'undefined' && window.electronApi !== undefined;
}; 