const fs = require('fs');
const path = require('path');

// This script converts the og-image.svg to og-image.png
// For Railway deployment, you can either:
// 1. Run this locally and commit the PNG
// 2. Use sharp/puppeteer in a build step
// 3. Use an SVG-to-PNG service

const siteDir = path.join(__dirname, '..');
const svgPath = path.join(siteDir, 'og-image.svg');
const pngPath = path.join(siteDir, 'og-image.png');

async function generateOgImage() {
  try {
    // Try using sharp if available
    const sharp = require('sharp');

    await sharp(svgPath)
      .resize(1200, 630)
      .png()
      .toFile(pngPath);

    console.log('Generated og-image.png successfully');
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log('sharp not installed. To generate og-image.png:');
      console.log('1. npm install sharp');
      console.log('2. Run this script again');
      console.log('');
      console.log('Or manually convert og-image.svg to og-image.png (1200x630)');
      console.log('using a tool like: https://svgtopng.com/');
    } else {
      console.error('Error generating og-image.png:', error.message);
    }
  }
}

generateOgImage();
