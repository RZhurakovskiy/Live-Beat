// Растеризует SVG-исходники иконок и нативного сплэша в PNG рядом с assets/.
// sharp в зависимостях проекта нет: поставь его во временную папку
// (npm i sharp --prefix <папка>) и запусти с NODE_PATH=<папка>/node_modules:
// команда node assets/src/rasterize.js из корня проекта.
const sharp = require('sharp');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = __dirname;

async function run() {
  await sharp(path.join(src, 'icon-full.svg')).resize(1024, 1024).png().toFile(path.join(root, 'icon.png'));
  await sharp(path.join(src, 'icon-foreground.svg')).resize(1024, 1024).png().toFile(path.join(root, 'android-icon-foreground.png'));
  await sharp(path.join(src, 'icon-background.svg')).resize(1024, 1024).png().toFile(path.join(root, 'android-icon-background.png'));
  await sharp(path.join(src, 'icon-monochrome.svg')).resize(1024, 1024).png().toFile(path.join(root, 'android-icon-monochrome.png'));
  await sharp(path.join(src, 'icon-foreground.svg')).resize(1024, 1024).png().toFile(path.join(root, 'splash-icon.png'));
  await sharp(path.join(src, 'splash-ring.svg')).resize(1024, 1024).png().toFile(path.join(root, 'splash-ring.png'));
  await sharp(path.join(src, 'icon-full.svg')).resize(196, 196).png().toFile(path.join(root, 'favicon.png'));
  console.log('done');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
