export const DEPENDENCY_TYPES = ['devDependencies', 'dependencies', 'legacyDependencies'];
export const RESOLUTIONS = 'resolutions';
export const MANIFEST_FIELDS = [RESOLUTIONS, ...DEPENDENCY_TYPES];
export const SUPPORTED_NODE_VERSIONS = '>=8.0.0';
export const NODE_PACKAGE_JSON = 'package.json';
export const DEFAULT_INDENT = '  ';