#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const brotliCompress = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

// Files to compress (text-based files benefit most from compression)
const COMPRESSIBLE_EXTENSIONS = [
  '.html', '.css', '.js', '.json', '.svg', '.txt', '.xml', '.ico'
];

// Minimum file size to compress (bytes) - skip tiny files
const MIN_FILE_SIZE = 512;

async function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

function shouldCompress(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  
  return COMPRESSIBLE_EXTENSIONS.includes(ext) && stat.size >= MIN_FILE_SIZE;
}

async function compressFile(filePath) {
  try {
    const content = await readFile(filePath);
    const originalSize = content.length;
    
    // Brotli compression (best compression)
    const brotliData = await brotliCompress(content, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 11, // Max quality
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: originalSize
      }
    });
    await writeFile(filePath + '.br', brotliData);
    const brotliSize = brotliData.length;
    const brotliSavings = ((1 - brotliSize / originalSize) * 100).toFixed(1);
    
    // Gzip compression (fallback for older browsers)
    const gzipData = await gzip(content, { level: 9 }); // Max compression
    await writeFile(filePath + '.gz', gzipData);
    const gzipSize = gzipData.length;
    const gzipSavings = ((1 - gzipSize / originalSize) * 100).toFixed(1);
    
    const relativePath = path.relative(process.cwd(), filePath);
    console.log(`✓ ${relativePath}`);
    console.log(`  Original: ${originalSize} bytes`);
    console.log(`  Brotli:   ${brotliSize} bytes (${brotliSavings}% smaller)`);
    console.log(`  Gzip:     ${gzipSize} bytes (${gzipSavings}% smaller)`);
    
    return { original: originalSize, brotli: brotliSize, gzip: gzipSize };
  } catch (error) {
    console.error(`✗ Error compressing ${filePath}:`, error.message);
    return null;
  }
}

async function main() {
  const outDir = path.join(__dirname, 'out');
  
  if (!fs.existsSync(outDir)) {
    console.error('Error: "out" directory not found. Run "npm run build" first.');
    process.exit(1);
  }
  
  console.log('🗜️  Compressing build files...\n');
  
  const allFiles = await getAllFiles(outDir);
  const compressibleFiles = allFiles.filter(shouldCompress);
  
  console.log(`Found ${compressibleFiles.length} files to compress\n`);
  
  let totalOriginal = 0;
  let totalBrotli = 0;
  let totalGzip = 0;
  
  for (const file of compressibleFiles) {
    const result = await compressFile(file);
    if (result) {
      totalOriginal += result.original;
      totalBrotli += result.brotli;
      totalGzip += result.gzip;
    }
    console.log(''); // Empty line between files
  }
  
  console.log('━'.repeat(60));
  console.log('📊 Summary:');
  console.log(`  Total original size: ${totalOriginal} bytes`);
  console.log(`  Total Brotli size:   ${totalBrotli} bytes (${((1 - totalBrotli / totalOriginal) * 100).toFixed(1)}% smaller)`);
  console.log(`  Total Gzip size:     ${totalGzip} bytes (${((1 - totalGzip / totalOriginal) * 100).toFixed(1)}% smaller)`);
  console.log(`\n✅ Compression complete! Created ${compressibleFiles.length * 2} compressed files.`);
}

main().catch(console.error);
