/** Injected by Vite at build time from package.json version field */
declare const __APP_VERSION__: string;

/** Exposed by electron/preload.cjs via contextBridge */
interface PlatformInfo {
  isElectron: boolean;
  isWindows: boolean;
  isMac: boolean;
  isLinux: boolean;
}

declare global {
  interface Window {
    platform?: PlatformInfo;
  }
}
