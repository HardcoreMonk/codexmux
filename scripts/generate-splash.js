const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const BG = '#131313';
// oklch(0.71 0.051 289) ≈ #a496c4
const BRAND = '#a496c4';

const SCREENS = [
  // iPhone
  { w: 1320, h: 2868, name: '1320x2868' }, // 16 Pro Max
  { w: 1206, h: 2622, name: '1206x2622' }, // 16 Pro
  { w: 1290, h: 2796, name: '1290x2796' }, // 16 Plus, 15 Plus, 14 Pro Max
  { w: 1179, h: 2556, name: '1179x2556' }, // 15 Pro, 14 Pro
  { w: 1170, h: 2532, name: '1170x2532' }, // 15, 14, 13
  { w: 1125, h: 2436, name: '1125x2436' }, // X, XS, 11 Pro
  { w: 1242, h: 2688, name: '1242x2688' }, // XS Max, 11 Pro Max
  { w: 828, h: 1792, name: '828x1792' },   // XR, 11
  { w: 750, h: 1334, name: '750x1334' },   // SE 3rd, 8, 7, 6s
  { w: 640, h: 1136, name: '640x1136' },   // SE 1st, 5s
  // iPad
  { w: 2048, h: 2732, name: '2048x2732' }, // Pro 12.9"
  { w: 1668, h: 2388, name: '1668x2388' }, // Pro 11"
  { w: 1640, h: 2360, name: '1640x2360' }, // Air
  { w: 1620, h: 2160, name: '1620x2160' }, // 10th gen
  { w: 1488, h: 2266, name: '1488x2266' }, // mini 6th
];

const outDir = path.join(__dirname, '..', 'public', 'splash');
fs.mkdirSync(outDir, { recursive: true });

const generateSplash = async ({ w, h, name }) => {
  const fontSize = Math.round(w * 0.038);

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${BG}"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="Inter, system-ui, sans-serif" font-size="${fontSize}" fill="${BRAND}">
    <tspan font-weight="700">codex</tspan><tspan font-weight="400">mux</tspan>
  </text>
</svg>`;

  await sharp(Buffer.from(svg))
    .png({ palette: true, compressionLevel: 9, effort: 10 })
    .toFile(path.join(outDir, `splash-${name}.png`));

  console.log(`  ${name}`);
};

(async () => {
  console.log('Generating splash screens...');
  for (const screen of SCREENS) {
    await generateSplash(screen);
  }
  console.log(`Done! ${SCREENS.length} images in public/splash/`);
})();
