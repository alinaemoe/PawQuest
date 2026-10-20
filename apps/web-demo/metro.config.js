// The web demo runs the real app code of apps/mobile; the modules that only exist on a phone are
// swapped for small web versions (shims/). Everything else is resolved as usual.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);

const shim = (name) => path.join(__dirname, 'shims', name);
const SHIMS = {
  '@maplibre/maplibre-react-native': shim('maplibre.tsx'),
  'expo-notifications': shim('notifications.ts'),
  'expo-location': shim('location.ts'),
  'expo-task-manager': shim('taskManager.ts'),
  'expo-file-system/legacy': shim('fileSystemLegacy.ts'),
  'expo-file-system': shim('fileSystem.ts'),
  'expo-keep-awake': shim('keepAwake.ts'),
  'expo-sharing': shim('sharing.ts'),
  'expo-image-picker': shim('imagePicker.ts'),
  'expo-print': shim('print.ts'),
  'expo-sqlite': shim('sqlite.ts'),
  'expo-media-library/legacy': shim('mediaLibrary.ts'),
  'expo-media-library': shim('mediaLibrary.ts'),
  '@pawquest/data/expo': shim('dataExpo.ts'),
};

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    const target = SHIMS[moduleName];
    if (target !== undefined) {
      return { type: 'sourceFile', filePath: target };
    }
    if (/pawquest-proximity[\\/]src$/.test(moduleName)) {
      return { type: 'sourceFile', filePath: shim('proximity.ts') };
    }
    // the one database of the app: on the web it is an in-memory SQLite (src/runtime.ts)
    if (
      moduleName === './runtime' &&
      /apps[\\/]mobile[\\/]src[\\/]app/.test(context.originModulePath)
    ) {
      return { type: 'sourceFile', filePath: path.join(__dirname, 'src', 'runtime.ts') };
    }
  }
  return (upstream ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
