/** @type {import('electron-builder').Configuration} */
const hasSigningCert = Boolean(
  process.env.CSC_LINK ||
  process.env.WIN_CSC_LINK ||
  process.env.CSC_LINK_SHA1
);

/** Stable upgrade GUID — do not change between releases. */
const NSIS_UPGRADE_GUID = '7c4e9a2b-1d8f-4e6a-9b3c-2f5d8e1a0c47';

module.exports = {
  appId: 'com.grandstrategy.game',
  productName: 'Grand Strategy',
  copyright: 'Copyright © ArmadilloArmada',
  directories: {
    output: 'release',
    buildResources: 'assets',
  },
  files: [
    'dist/**/*',
    'electron/**/*',
    'assets/**/*',
  ],
  asar: true,
  asarUnpack: ['**/*.node'],
  electronLanguages: ['en-US'],
  compression: 'maximum',
  forceCodeSigning: hasSigningCert,
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'zip', arch: ['x64'] },
    ],
    artifactName: '${productName}-${version}-win-x64.${ext}',
    icon: 'assets/icon.ico',
    publisherName: 'ArmadilloArmada',
    legalTrademarks: 'Grand Strategy',
    executableName: 'Grand Strategy',
    requestedExecutionLevel: 'asInvoker',
    signAndEditExecutable: hasSigningCert,
    signDlls: hasSigningCert,
    verifyUpdateCodeSignature: hasSigningCert,
  },
  mac: {
    target: ['dmg', 'zip'],
    icon: 'assets/icon.icns',
    category: 'public.app-category.strategy-games',
    hardenedRuntime: hasSigningCert,
    gatekeeperAssess: hasSigningCert,
  },
  linux: {
    target: ['AppImage', 'deb'],
    icon: 'assets/icon.png',
    category: 'Game',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: false,
    installerIcon: 'assets/icon.ico',
    uninstallerIcon: 'assets/icon.ico',
    installerHeaderIcon: 'assets/icon.ico',
    license: 'LICENSE',
    guid: NSIS_UPGRADE_GUID,
    artifactName: '${productName} Setup ${version}.${ext}',
    shortcutName: 'Grand Strategy',
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    runAfterFinish: true,
    deleteAppDataOnUninstall: false,
    uninstallDisplayName: 'Grand Strategy',
  },
  portable: {
    artifactName: '${productName} ${version} Portable.${ext}',
  },
};
