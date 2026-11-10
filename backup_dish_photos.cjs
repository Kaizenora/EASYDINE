const { PrismaClient } = require('./apps/backend/node_modules/@prisma/client');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const prisma = new PrismaClient();

function sha256File(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function main() {
  console.log('=== CHECK 2: SEPARATE PHOTO BACKUP & INTEGRITY AUDIT ===\n');

  const uploadsDir = path.join(__dirname, 'apps', 'backend', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    throw new Error(`Uploads directory not found: ${uploadsDir}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, 'backups', `photos_backup_${timestamp}`);
  const backupImagesDir = path.join(backupDir, 'images');

  fs.mkdirSync(backupImagesDir, { recursive: true });

  // 1. Query dishes with images
  console.log('1. Querying database for menu items with images...');
  const dishes = await prisma.menuItem.findMany({
    where: { imageUrl: { not: null } },
    include: {
      branch: {
        include: {
          restaurant: { select: { id: true, name: true } },
        },
      },
    },
  });

  console.log(`   Found ${dishes.length} menu item(s) with imageUrl in database.`);

  // 2. Scan all files in uploadsDir
  const diskFiles = fs.readdirSync(uploadsDir).filter((f) => {
    return fs.statSync(path.join(uploadsDir, f)).isFile();
  });
  console.log(`   Found ${diskFiles.length} file(s) in ${uploadsDir}.`);

  const manifest = {
    backupTimestamp: new Date().toISOString(),
    sourceDirectory: uploadsDir,
    totalDiskFiles: diskFiles.length,
    totalDishesWithImages: dishes.length,
    dishes: [],
    files: [],
  };

  // 3. Copy files and build manifest
  console.log('\n2. Copying image files and computing SHA-256 checksums...');
  for (const filename of diskFiles) {
    const srcPath = path.join(uploadsDir, filename);
    const destPath = path.join(backupImagesDir, filename);

    fs.copyFileSync(srcPath, destPath);

    const hash = sha256File(srcPath);
    const backupHash = sha256File(destPath);
    const stats = fs.statSync(srcPath);

    if (hash !== backupHash) {
      throw new Error(`Checksum mismatch during backup of ${filename}!`);
    }

    const linkedDishes = dishes.filter(
      (d) => d.imageUrl && d.imageUrl.includes(filename),
    );

    manifest.files.push({
      filename,
      sha256: hash,
      sizeBytes: stats.size,
      linkedDishes: linkedDishes.map((d) => ({
        id: d.id,
        name: d.name,
        restaurant: d.branch?.restaurant?.name,
      })),
    });
  }

  for (const dish of dishes) {
    const filename = dish.imageUrl ? path.basename(dish.imageUrl) : null;
    const exists = filename && fs.existsSync(path.join(uploadsDir, filename));
    const hash = exists ? sha256File(path.join(uploadsDir, filename)) : null;

    manifest.dishes.push({
      dishId: dish.id,
      dishName: dish.name,
      restaurantId: dish.branch?.restaurant?.id,
      restaurantName: dish.branch?.restaurant?.name,
      branchId: dish.branchId,
      branchName: dish.branch?.name,
      imageUrl: dish.imageUrl,
      filename,
      fileExistsOnDisk: exists,
      sha256: hash,
    });
  }

  // Write manifest.json
  const manifestPath = path.join(backupDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  // Write manifest.sha256
  const manifestHash = sha256File(manifestPath);
  const manifestHashPath = path.join(backupDir, 'manifest.sha256');
  fs.writeFileSync(manifestHashPath, `${manifestHash}  manifest.json\n`, 'utf8');

  console.log(`   Backup manifest written: ${manifestPath}`);
  console.log(`   Manifest SHA-256: ${manifestHash}`);

  // 4. Verification of counts and checksums
  console.log('\n3. Verifying backup counts and checksums...');
  const backedUpFiles = fs.readdirSync(backupImagesDir);
  console.log(`   Original file count: ${diskFiles.length}`);
  console.log(`   Backed up file count: ${backedUpFiles.length}`);
  if (diskFiles.length !== backedUpFiles.length) {
    throw new Error('Count mismatch between original and backup!');
  }

  let verifiedFilesCount = 0;
  for (const entry of manifest.files) {
    const backupFilePath = path.join(backupImagesDir, entry.filename);
    const hash = sha256File(backupFilePath);
    if (hash !== entry.sha256) {
      throw new Error(`Checksum verification failed for ${entry.filename}`);
    }
    verifiedFilesCount++;
  }
  console.log(`   All ${verifiedFilesCount} files successfully verified against SHA-256 hashes.`);

  // 5. Test restore into a temporary folder
  console.log('\n4. Test restoration into isolated temporary directory...');
  const tempRestoreDir = path.join(__dirname, 'backups', `test_restore_${timestamp}`);
  fs.mkdirSync(tempRestoreDir, { recursive: true });

  const sampleFile = manifest.files[0];
  if (sampleFile) {
    const restoreSrc = path.join(backupImagesDir, sampleFile.filename);
    const restoreDest = path.join(tempRestoreDir, sampleFile.filename);

    fs.copyFileSync(restoreSrc, restoreDest);

    const restoredHash = sha256File(restoreDest);
    console.log(`   Sample file restored: ${sampleFile.filename}`);
    console.log(`   Original SHA-256:  ${sampleFile.sha256}`);
    console.log(`   Restored SHA-256:  ${restoredHash}`);
    if (restoredHash !== sampleFile.sha256) {
      throw new Error('Sample file restore checksum mismatch!');
    }
    console.log('   Sample file read verification: SUCCESS (binary identical).');
  }

  // Cleanup temp restore dir
  fs.rmSync(tempRestoreDir, { recursive: true, force: true });
  console.log('   Temporary restore directory cleanly removed.');

  console.log('\n=== CHECK 2 RESULT: SUCCESS ===');
  console.log(JSON.stringify({
    backupDirectory: backupDir,
    imagesDirectory: backupImagesDir,
    manifestFile: manifestPath,
    manifestHash,
    totalFilesBackedUp: diskFiles.length,
    totalDishesMapped: dishes.length,
    verification: 'PASSED (100% SHA-256 match)',
  }, null, 2));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\nCHECK 2 FAILED:', e);
  await prisma.$disconnect();
  process.exit(1);
});
