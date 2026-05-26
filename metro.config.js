const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const config = getDefaultConfig(__dirname);

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  try {
    if (originalResolveRequest) {
      return originalResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  } catch (error) {
    // Fallback: resolve relative directory imports to their index file.
    // Needed for packages like react-native-calendars that ship raw TS source
    // and use bare directory imports (e.g. './calendar' -> './calendar/index.js').
    if (moduleName.startsWith('.')) {
      const originDir = path.dirname(context.originModulePath);
      const candidate = path.resolve(originDir, moduleName);
      for (const ext of ['index.js', 'index.ts', 'index.tsx', 'index.jsx']) {
        const full = path.join(candidate, ext);
        if (fs.existsSync(full)) {
          return { filePath: full, type: 'sourceFile' };
        }
      }
    }
    throw error;
  }
};

module.exports = config;
