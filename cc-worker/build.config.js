// Build configuration for pkg
// Run: npm run build:binary

export default {
  pkg: {
    scripts: 'dist/**/*.js',
    assets: [],
    targets: [
      'node18-macos-x64',
      'node18-macos-arm64',
      'node18-win-x64',
      'node18-linux-x64',
    ],
    outputPath: 'binaries',
  },
};
