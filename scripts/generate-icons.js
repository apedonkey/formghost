/**
 * Icon Generator Script for Puppeteer Recorder Pro
 *
 * This script generates PNG icons for the Chrome extension.
 *
 * Usage:
 *   node scripts/generate-icons.js
 *
 * Requirements:
 *   npm install canvas
 *
 * Alternatively, open icons/generate-icons.html in a browser
 * to generate and download the icons manually.
 */

const fs = require('fs');
const path = require('path');

// Try to use canvas if available
let createCanvas;
try {
  createCanvas = require('canvas').createCanvas;
} catch (e) {
  console.log('Canvas module not found. Using fallback method.');
  console.log('Install with: npm install canvas');
  console.log('Or open icons/generate-icons.html in a browser to generate icons.\n');
  createFallbackIcons();
  process.exit(0);
}

/**
 * Draws the recorder icon
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} size - Icon size
 */
function drawIcon(ctx, size) {
  const center = size / 2;
  const radius = size * 0.35;

  // Background circle (dark)
  ctx.beginPath();
  ctx.arc(center, center, size * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a2e';
  ctx.fill();

  // Outer ring
  ctx.beginPath();
  ctx.arc(center, center, size * 0.42, 0, Math.PI * 2);
  ctx.strokeStyle = '#e63946';
  ctx.lineWidth = size * 0.04;
  ctx.stroke();

  // Inner record button (red circle)
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);

  // Gradient for 3D effect
  const gradient = ctx.createRadialGradient(
    center - radius * 0.3, center - radius * 0.3, 0,
    center, center, radius
  );
  gradient.addColorStop(0, '#ff6b6b');
  gradient.addColorStop(1, '#e63946');
  ctx.fillStyle = gradient;
  ctx.fill();

  // Highlight
  ctx.beginPath();
  ctx.arc(center - radius * 0.25, center - radius * 0.25, radius * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fill();
}

/**
 * Generates icon files using canvas
 */
function generateIcons() {
  const sizes = [16, 48, 128];
  const iconsDir = path.join(__dirname, '..', 'icons');

  // Ensure icons directory exists
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  sizes.forEach(size => {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    drawIcon(ctx, size);

    const buffer = canvas.toBuffer('image/png');
    const filepath = path.join(iconsDir, `icon${size}.png`);

    fs.writeFileSync(filepath, buffer);
    console.log(`Created: ${filepath}`);
  });

  console.log('\nIcons generated successfully!');
}

/**
 * Creates simple fallback icons (solid red circles)
 */
function createFallbackIcons() {
  const iconsDir = path.join(__dirname, '..', 'icons');

  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  // Minimal PNG data for a red circle (pre-generated base64)
  // These are simple placeholder icons
  const icons = {
    16: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA2klEQVQ4T6WTsQ3CQBAE5x4ggQIogEQKIJECSKQAEikAWiCRAvgKgAIIJCCR0MLOaU/y2T5hPF9wtu/2ZnfvLCRNq+q6bjoOfS4DmE9mT4AN8Ap0kr6LgLMI+BhEPQI7oA20kq4lQGOgP4M8hTdAnrJa1ybzD+BM0jVrmA+ozj4vZeAnpbW7Cti/F3AT+X+AZQR4CwDvkq4ioDGQH1CTfb7v84MA2wioJF1EQGOgPoM8h0j4rLDzClTALgJsS7oogKWBvIC2gJMIsC/pPAJc6nMAj5L2yvMLyNbkD+YjfhF1mlXfAAAAAElFTkSuQmCC',
    48: 'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAA8klEQVRoQ+2YMQ6AIBAE9/4f8wH+wAf4A5/hD0xsLIwtJhYGYxQKQwgc7C63C0WB5G64djl2cgKkK+ArYAVMAE9JVxFwFAEug6g7YA60QCXpKAJSA/0M8hySoL3TxicALRFQSTqIgNRAewb5SkhC14paI6CSdBcBiYHiDPIqJMF3haXZn1HALgJsC9srgI2B+gzyGpJQZ6WVFVBJ+osAFwPJGeQ9JKHLTGuqQCXpLwI0BoozyGdIQu8bvSSgknQXASoG0jPIV0hC7xP9ToBS0kkEJAbSM8hvhOC7wq4qUEnaiwDHQHIG+QtJkP8J8B9J0PxKC7bSfhGm7WLHAP4AAAAASUVORK5CYII=',
    128: 'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAADrklEQVR4Xu2dS3LTQBBF+y4gsAJYAawAVgArYAWwAlgBrABWACuAFcAKYAUkKyC7ONVTZRz/pJnumR79fFWp2JLn9e3bM5Is8kH6cfkZ8kHLDfJBww3yQd0N8kGjGeSDehtYN4h6AGqz/sF6A+uyvu/4DLAq+4cN4l7/g9X9f7B2/w+WPwGsHoDV2d+3fgLYlP19+/8C/wKotr9P0AGoyr6V/Q1AWfa/stYAUJV9K/ubgNLsWzXQBPRu0/z+gfL+P1j9/kFt/x8svwBYY38fkPAAaNn/B6sGQNb+tvv/YN0AWLNvdXQN0Lr/Dxb/Alhi/9j9f7BsACyy/4mlfX4L/X+wzP4WBsDS/r8OkA4b2P8Ha+wP0tL/j4dVT4DF/X+wxP7WBsC6AWjZ/wdL7G/dAKRuQP/+P1h2/1/YvwCW9v/B0v0/WHH/HxbZP1bR/4M19j/rKwBr7J9d/x9s6v8D6+yP0+oPIK32D6T+P+xa+weS9v+xWv8fWGR/qwMAibsBDfv/YI39cx4Ai/v/YJH9rQ4AJO7+o7r+P9j2+keh/w822b9Grf0NhM1O0Dr7e6u3/w9W2d8A5P//IKuzP0iz/w9W2j/nOwDW2V8H1Of/A+vsb+1fAJbZPxf+BbDU/tbfALTu/4NF9s9xACDx/iPW9P/BpvZHqfo/sNb+1t4CtGr/EGvtH0i7/w8W2z8TrbN/rK39f7Dq/h+ssX+I1vv/YLP9Q+Tsb6pV/w9W2j+TVg0ApPq/sNL+BdJS/19j/4z7A8n9n0n0/8Fm+yfS9n9huf8D6+1/lPT7/2C9/SNp/T9Y3/+B5f0PJNP/B8v7v9By/wfW2D8j/f8DK/t/sM7+GentH1hn/9S0bAAg8f8/ktz/gRX9v7B6+4el9f+BlL+B9f0fWL39A9LbP5Bm/w9W2j9I6v+BFfY3ta7/B1b2vyb9/4FV9tfk3v+FNfY3sMr+0qru/8G2/h+stH8g6f8H1tn/RLT9P1jr/x9Y5f8Q6f+/kfT/ByvsH5be/8Ea+weSqP8D6+wfaO7/wXr7/0hi/wOr7O8j0f8/sNL+p6L7/8Fa+6ek/5+T5v8Pa+0fktb/B1bZP5La/x9YZ/+MdP4frLd/hvT/F1bYP9C6/wer+39I+v8Dq+0fSPr/BdbZP1c6/ycstX8g7f9+qP8Da+0fSLr/C6vuH0j//8FK+8ek+79gr/3/G8n0f0f0/8Hq/j9YaX8Dq+xv+h9z4YlLLwqn2QAAAABJRU5ErkJggg=='
  };

  Object.entries(icons).forEach(([size, base64]) => {
    const filepath = path.join(iconsDir, `icon${size}.png`);
    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(filepath, buffer);
    console.log(`Created fallback: ${filepath}`);
  });

  console.log('\nFallback icons created. For better icons:');
  console.log('1. Install canvas: npm install canvas');
  console.log('2. Run this script again');
  console.log('OR open icons/generate-icons.html in a browser');
}

// Run
if (createCanvas) {
  generateIcons();
} else {
  createFallbackIcons();
}
