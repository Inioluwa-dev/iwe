const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 1. Ensure public directory exists
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
}

// 2. Copy index.html, guide.html and assets to public/
fs.copyFileSync(
  path.join(__dirname, 'index.html'),
  path.join(publicDir, 'index.html')
);
fs.copyFileSync(
  path.join(__dirname, 'guide.html'),
  path.join(publicDir, 'guide.html')
);
console.log('Copied HTML files to public/');

// 3. Run javascript-obfuscator to compile files directly into public/ folder
try {
  console.log('Obfuscating db.js -> public/db.js...');
  execSync('npx javascript-obfuscator db.js --output public/db.js --compact true', { stdio: 'inherit' });

  console.log('Obfuscating app.js -> public/app.js...');
  execSync('npx javascript-obfuscator app.js --output public/app.js --compact true', { stdio: 'inherit' });
  
  console.log('Build completed successfully! Served from public/ folder.');
} catch (error) {
  console.error('Error during build:', error);
  process.exit(1);
}
