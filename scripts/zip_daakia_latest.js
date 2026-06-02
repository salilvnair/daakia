/**
 * zip_daakia_latest.js
 * Creates a zip backup of the daakia project one folder up (../)
 * Filename: daakia_MM_DD_YYYY_HH_MM_SS.zip
 * Ignores: .git folder + everything in .gitignore
 *
 * Usage: node scripts/zip_daakia_latest.js
 */

const fs = require('fs');
const path = require('path');
const { ZipArchive } = require('archiver');

const ROOT = path.resolve(__dirname, '..');
const GITIGNORE_PATH = path.join(ROOT, '.gitignore');

// Always ignore .git
const ALWAYS_IGNORE = ['.git'];

/**
 * Parse .gitignore and return an array of patterns
 */
function parseGitignore(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

/**
 * Check if a relative path matches a gitignore pattern
 */
function matchesPattern(relPath, pattern) {
  // Normalize separators
  const normalized = relPath.replace(/\\/g, '/');

  // Remove trailing slash from pattern (means directory only, but we check both)
  const cleanPattern = pattern.replace(/\/$/, '');

  // Split into segments
  const pathSegments = normalized.split('/');

  // If pattern has no slash, it matches any segment in the path
  if (!cleanPattern.includes('/')) {
    // Match against any path segment or the filename
    for (const segment of pathSegments) {
      if (matchGlob(segment, cleanPattern)) return true;
    }
    return false;
  }

  // Pattern has a slash — match from root
  const patternClean = cleanPattern.startsWith('/') ? cleanPattern.slice(1) : cleanPattern;
  return matchGlob(normalized, patternClean) || normalized.startsWith(patternClean + '/') || normalized === patternClean;
}

/**
 * Simple glob matching (supports * and ?)
 */
function matchGlob(str, pattern) {
  // Escape regex special chars except * and ?
  const regexStr = pattern
    .replace(/([.+^${}()|[\]\\])/g, '\\$1')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regexStr}$`).test(str);
}

/**
 * Check if a path should be ignored
 */
function shouldIgnore(relPath, patterns) {
  // Check always-ignore list
  const normalized = relPath.replace(/\\/g, '/');
  for (const ign of ALWAYS_IGNORE) {
    if (normalized === ign || normalized.startsWith(ign + '/')) return true;
  }

  // Check negation patterns (lines starting with !)
  let ignored = false;
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) {
      const negPattern = pattern.slice(1);
      if (matchesPattern(relPath, negPattern)) {
        ignored = false;
      }
    } else {
      if (matchesPattern(relPath, pattern)) {
        ignored = true;
      }
    }
  }
  return ignored;
}

/**
 * Recursively collect all files respecting gitignore
 */
function collectFiles(dir, patterns, baseDir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath);

    if (shouldIgnore(relPath, patterns)) continue;

    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, patterns, baseDir));
    } else if (entry.isFile()) {
      files.push(relPath);
    }
  }

  return files;
}

/**
 * Get timestamp string: MM_DD_YYYY_HH_MM_SS
 */
function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return [
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    now.getFullYear(),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('_');
}

// ─── Main ───

async function main() {
  const patterns = parseGitignore(GITIGNORE_PATH);
  console.log(`📋 Parsed .gitignore: ${patterns.length} patterns`);
  console.log(`   Always ignored: ${ALWAYS_IGNORE.join(', ')}`);

  // Collect files
  console.log('\n📂 Scanning project files...');
  const files = collectFiles(ROOT, patterns, ROOT);
  console.log(`   Found ${files.length} files to include`);

  // Output path
  const timestamp = getTimestamp();
  const zipName = `daakia_${timestamp}.zip`;
  const outputPath = path.resolve(ROOT, '..', zipName);

  // Create zip
  console.log(`\n📦 Creating: ${zipName}`);
  const output = fs.createWriteStream(outputPath);
  const archive = new ZipArchive({ zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`\n✅ Done! ${zipName} (${sizeMB} MB)`);
      console.log(`   Location: ${outputPath}`);
      resolve();
    });

    archive.on('error', (err) => {
      console.error('❌ Zip error:', err.message);
      reject(err);
    });

    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') throw err;
      console.warn('⚠️', err.message);
    });

    archive.pipe(output);

    // Add files
    for (const relFile of files) {
      const fullPath = path.join(ROOT, relFile);
      archive.file(fullPath, { name: relFile.replace(/\\/g, '/') });
    }

    archive.finalize();
  });
}

main().catch((err) => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
