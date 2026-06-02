const { SVGIcons2SVGFontStream } = require('svgicons2svgfont');
const svg2ttf = require('svg2ttf');
const ttf2woff = require('ttf2woff');
const fs = require('fs');
const path = require('path');

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const inputDir = path.join(rootDir, 'images', 'icon-font-src');
  const outputDir = path.join(rootDir, 'images');
  const svgFile = path.join(inputDir, 'daakia-icon.svg');

  console.log('Input SVG:', svgFile);
  console.log('Output dir:', outputDir);

  // svgicons2svgfont → svg2ttf → ttf2woff
  const svgFont = await new Promise((resolve, reject) => {
    const fontStream = new SVGIcons2SVGFontStream({
      fontName: 'daakia-icons',
      normalize: true,
      fontHeight: 1024,
    });

    let svgData = '';
    fontStream.on('data', (chunk) => { svgData += chunk.toString(); });
    fontStream.on('end', () => resolve(svgData));
    fontStream.on('error', reject);

    const glyph = fs.createReadStream(svgFile);
    glyph.metadata = { unicode: ['\uE001'], name: 'daakia-icon' };
    fontStream.write(glyph);
    fontStream.end();
  });

  console.log('SVG font generated, length:', svgFont.length);

  // SVG font → TTF
  const ttf = svg2ttf(svgFont, {});
  console.log('TTF generated, length:', ttf.buffer.length);

  // TTF → WOFF
  const woff = ttf2woff(ttf.buffer);
  const woffPath = path.join(outputDir, 'daakia-icons.woff');
  fs.writeFileSync(woffPath, Buffer.from(woff.buffer));
  console.log('WOFF written to:', woffPath);

  // Write codepoints JSON
  const codepointsPath = path.join(outputDir, 'daakia-icons.json');
  fs.writeFileSync(codepointsPath, JSON.stringify({ 'daakia-icon': 'E001' }, null, 2));
  console.log('Codepoints written to:', codepointsPath);
  console.log('\nUse fontCharacter "\\\\E001" in package.json contributes.icons');
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
