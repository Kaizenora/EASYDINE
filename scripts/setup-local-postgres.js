const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = 'C:\\Users\\ASUS\\.gemini\\antigravity\\scratch\\easy-dine-pos';
const targetDir = path.join(rootDir, '.postgres');
const zipPath = path.join(rootDir, 'postgres.zip');
const url = 'https://github.com/theseus-rs/postgresql-binaries/releases/download/16.15.0/postgresql-16.15.0-x86_64-pc-windows-msvc.zip';

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (uri) => {
      https.get(uri, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          get(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Failed with status ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
    };
    get(url);
  });
}

async function main() {
  if (fs.existsSync(path.join(targetDir, 'bin', 'postgres.exe'))) {
    console.log('Postgres already installed at', targetDir);
    return;
  }
  console.log('Downloading portable Postgres...');
  await download(url, zipPath);
  console.log('Extracting to', targetDir);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  execSync(`tar -xf "${zipPath}" -C "${targetDir}"`, { stdio: 'inherit' });
  fs.unlinkSync(zipPath);
  console.log('Postgres binary extracted successfully!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
