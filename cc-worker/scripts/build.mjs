#!/usr/bin/env node

import * as esbuild from 'esbuild';
import { execFileSync } from 'child_process';
import { mkdirSync, existsSync, readdirSync, statSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function build() {
  console.log('🔨 Building cc-worker...\n');

  // Step 1: Bundle with esbuild
  console.log('📦 Step 1: Bundling with esbuild...');

  try {
    await esbuild.build({
      entryPoints: ['src/index.ts'],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs', // CommonJS format for pkg compatibility
      outfile: 'dist-bundle/index.js',
      minify: false, // Don't minify for better pkg compatibility
      sourcemap: false,
      external: [],
    });
    console.log('✅ Bundle created: dist-bundle/index.js\n');
  } catch (error) {
    console.error('❌ Bundling failed:', error);
    process.exit(1);
  }

  // Step 2: Create binaries directory
  if (!existsSync('binaries')) {
    mkdirSync('binaries', { recursive: true });
  }

  // Step 3: Create a temporary package.json for pkg
  const pkgConfig = {
    name: 'cc-worker',
    version: '1.0.0',
    bin: 'index.js',
    pkg: {
      assets: [],
      targets: ['node18-macos-x64', 'node18-macos-arm64', 'node18-linux-x64', 'node18-win-x64'],
      outputPath: '../binaries'
    }
  };

  writeFileSync('dist-bundle/package.json', JSON.stringify(pkgConfig, null, 2));

  // Step 4: Create binary with pkg
  console.log('🔧 Step 2: Creating binaries with pkg...');

  const buildAll = process.argv.includes('--all');
  const targets = buildAll
    ? ['node18-macos-x64', 'node18-macos-arm64', 'node18-linux-x64', 'node18-win-x64']
    : ['node18-macos-arm64', 'node18-macos-x64'];

  try {
    const args = [
      'pkg',
      'dist-bundle/package.json',
      '--targets', targets.join(','),
      '--output', 'binaries/cc-worker',
      '--compress', 'GZip'
    ];

    execFileSync('npx', args, { stdio: 'inherit' });

    console.log('\n✅ Binaries created successfully!');
    console.log('📁 Output location: binaries/\n');

    // List created files
    const files = readdirSync('binaries');
    console.log('Created binaries:');
    for (const file of files) {
      const filePath = join('binaries', file);
      const stats = statSync(filePath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`  - ${file} (${sizeMB} MB)`);
    }
  } catch (error) {
    console.error('❌ Binary creation failed:', error);
    process.exit(1);
  }
}

build();
