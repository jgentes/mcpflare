// Simple script to remind user to convert SVG to PNG
// VS Code requires PNG format for extension icons

const fs = require('fs');
const path = require('path');

console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    MCPflare Icon Setup                        ║
╠════════════════════════════════════════════════════════════════╣
║                                                                 ║
║  VS Code requires a PNG file for extension icons.              ║
║                                                                 ║
║  Please convert media/icon.svg to media/icon.png (128x128)     ║
║                                                                 ║
║  Options:                                                       ║
║                                                                 ║
║  1. Online: https://svgtopng.com/                              ║
║                                                                 ║
║  2. Inkscape:                                                   ║
║     inkscape icon.svg -o icon.png -w 128 -h 128                ║
║                                                                 ║
║  3. ImageMagick:                                                ║
║     magick icon.svg -resize 128x128 icon.png                   ║
║                                                                 ║
║  4. Sharp (npm install sharp):                                  ║
║     See convert-icon-sharp.js                                   ║
║                                                                 ║
╚════════════════════════════════════════════════════════════════╝
`);





