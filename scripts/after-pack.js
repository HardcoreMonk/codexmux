/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

exports.default = async (context) => {
  const unpacked = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources', 'app.asar.unpacked');

  if (!fs.existsSync(unpacked)) return;

  const removeBrokenSymlinks = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        try {
          fs.statSync(full);
        } catch {
          fs.unlinkSync(full);
        }
      } else if (entry.isDirectory()) {
        removeBrokenSymlinks(full);
      }
    }
  };

  removeBrokenSymlinks(unpacked);
  console.log('[after-pack] removed broken symlinks from app.asar.unpacked');
};
