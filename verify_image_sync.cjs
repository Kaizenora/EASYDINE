const { PrismaClient } = require('./apps/backend/node_modules/@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const BASE_URL = 'http://127.0.0.1:4000/api/v1';
const WEB_URL = 'http://localhost:3000';

async function main() {
  console.log('=== CHECK 1: IMAGE SYNC VERIFICATION ON TEST TENANT ===\n');

  // 1. Get dedicated test tenant
  const restaurant = await prisma.restaurant.findFirst({
    where: { name: 'TEST-RESTAURANT-DO-NOT-USE' },
  });
  if (!restaurant) throw new Error('Test restaurant not found');

  const branch = await prisma.branch.findFirst({
    where: { restaurantId: restaurant.id, name: 'TEST-BRANCH' },
  });
  if (!branch) throw new Error('Test branch not found');

  const table = await prisma.table.findFirst({
    where: { floor: { branchId: branch.id } },
  });
  if (!table || !table.qrToken) throw new Error('Test table with qrToken not found');

  const category = await prisma.menuCategory.findFirst({
    where: { branchId: branch.id },
  });
  if (!category) throw new Error('Test category not found');

  // Ensure Cashier role has menu.manage and menu.view permissions
  const cashierRole = await prisma.role.findFirst({
    where: { restaurantId: restaurant.id, name: 'CASHIER' },
  });
  const menuPerms = await prisma.permission.findMany({
    where: { key: { in: ['menu.manage', 'menu.view'] } },
  });
  for (const perm of menuPerms) {
    const existing = await prisma.rolePermission.findFirst({
      where: { roleId: cashierRole.id, permissionId: perm.id },
    });
    if (!existing) {
      await prisma.rolePermission.create({
        data: { roleId: cashierRole.id, permissionId: perm.id },
      });
    }
  }

  // 2. Authenticate test cashier
  console.log('1. Authenticating test cashier...');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'testcashier@easydine.local',
      password: 'TestPass@123',
    }),
  });
  const rawCookies = loginRes.headers.get('set-cookie') || '';
  const match = rawCookies.match(/easydine_session=([^;]+)/);
  if (!match) throw new Error('Failed to login cashier: ' + rawCookies);
  const sessionCookie = `easydine_session=${match[1]}`;
  console.log('   Authenticated successfully. Session cookie acquired.');

  // 3. Upload a NEW TEST dish image through cashier upload endpoint
  console.log('\n2. Uploading NEW TEST dish image via POST /menu/items/upload-image (cashier multipart flow)...');
  // 4x4 red PNG base64
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAUSURBVBhXY/jPwIAFDGBcEI1mBgAZbAYvW5PjEgAAAABJRU5ErkJggg==';
  const pngBuffer = Buffer.from(pngBase64, 'base64');

  const blob = new Blob([pngBuffer], { type: 'image/png' });
  const formData = new FormData();
  formData.append('file', blob, 'test_dish_samosa.png');

  const uploadRes = await fetch(`${BASE_URL}/menu/items/upload-image`, {
    method: 'POST',
    headers: {
      Cookie: sessionCookie,
    },
    body: formData,
  });

  const uploadJson = await uploadRes.json();
  if (!uploadRes.ok) throw new Error('Upload failed: ' + JSON.stringify(uploadJson));
  console.log('   Upload API response:', uploadJson);
  const uploadedUrl = uploadJson.url; // e.g. /api/uploads/<uuid>.png
  const filename = path.basename(uploadedUrl);

  // 4. Verify actual file location on disk
  console.log('\n3. Verifying actual file location on disk...');
  const diskPath = path.join(__dirname, 'apps', 'backend', 'uploads', filename);
  const fileExists = fs.existsSync(diskPath);
  const fileStats = fileExists ? fs.statSync(diskPath) : null;
  console.log(`   Expected disk path: ${diskPath}`);
  console.log(`   File exists: ${fileExists}`);
  console.log(`   File size on disk: ${fileStats?.size} bytes`);
  if (!fileExists) throw new Error(`File was not saved to expected path: ${diskPath}`);

  // 5. Create or update a menu item in TEST restaurant with this uploaded image
  console.log('\n4. Creating/Updating TEST dish in database with uploaded imageUrl...');
  let testDish = await prisma.menuItem.findFirst({
    where: { branchId: branch.id, name: 'Test Samosa Chaat' },
  });

  if (!testDish) {
    const createItemRes = await fetch(`${BASE_URL}/menu/items?branchId=${branch.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        categoryId: category.id,
        name: 'Test Samosa Chaat',
        description: 'Crispy samosa topped with spiced yoghurt, sev, and chutney',
        price: 120.0,
        isVeg: true,
        isActive: true,
        imageUrl: uploadedUrl,
      }),
    });
    const createItemJson = await createItemRes.json();
    if (!createItemRes.ok) throw new Error('Create dish failed: ' + JSON.stringify(createItemJson));
    testDish = createItemJson;
    console.log(`   Created new test dish: "${testDish.name}" (ID: ${testDish.id})`);
  } else {
    const updateItemRes = await fetch(`${BASE_URL}/menu/items/${testDish.id}?branchId=${branch.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        imageUrl: uploadedUrl,
      }),
    });
    const updateItemJson = await updateItemRes.json();
    if (!updateItemRes.ok) throw new Error('Update dish failed: ' + JSON.stringify(updateItemJson));
    testDish = updateItemJson;
    console.log(`   Updated existing test dish: "${testDish.name}" (ID: ${testDish.id})`);
  }

  // 6. Verify DB record in Supabase / Prisma
  console.log('\n5. Querying database record via Prisma...');
  const dbItem = await prisma.menuItem.findUnique({
    where: { id: testDish.id },
  });
  console.log(`   DB Record: ID="${dbItem.id}", Name="${dbItem.name}", imageUrl="${dbItem.imageUrl}"`);
  if (dbItem.imageUrl !== uploadedUrl) {
    throw new Error(`DB imageUrl mismatch: expected ${uploadedUrl}, got ${dbItem.imageUrl}`);
  }

  // 7. Verify Customer QR Menu Incognito & Hard Reload
  console.log('\n6. Fetching customer QR menu incognito (no cookies) for table QR:', table.qrToken);
  // Fetch 1: initial
  const menuRes1 = await fetch(`${BASE_URL}/public/menu/${table.qrToken}`, {
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  });
  const menuJson1 = await menuRes1.json();

  // Fetch 2: hard reload simulation
  const menuRes2 = await fetch(`${BASE_URL}/public/menu/${table.qrToken}`, {
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  });
  const menuJson2 = await menuRes2.json();

  const publicDish = menuJson2.categories
    .flatMap((c) => c.items)
    .find((i) => i.id === testDish.id);

  console.log(`   Customer menu items returned: ${menuJson2.categories.flatMap(c => c.items).length} items`);
  console.log(`   Dish found on public menu: "${publicDish?.name}"`);
  console.log(`   Dish public imageUrl: "${publicDish?.imageUrl}"`);
  if (!publicDish || publicDish.imageUrl !== uploadedUrl) {
    throw new Error('Dish or imageUrl missing from public customer menu');
  }

  // 8. Verify image rendering through Next.js proxy & Backend
  console.log('\n7. Verifying image rendering via HTTP GET...');
  // Backend direct
  const backendImgRes = await fetch(`${BASE_URL.replace('/api/v1', '')}${uploadedUrl}`);
  const backendImgBytes = Buffer.from(await backendImgRes.arrayBuffer());
  console.log(`   Backend direct: HTTP ${backendImgRes.status}, Content-Type: ${backendImgRes.headers.get('content-type')}, Size: ${backendImgBytes.length} bytes`);

  // Next.js Web proxy
  const webImgRes = await fetch(`${WEB_URL}${uploadedUrl}`);
  const webImgBytes = Buffer.from(await webImgRes.arrayBuffer());
  console.log(`   Next.js proxy: HTTP ${webImgRes.status}, Content-Type: ${webImgRes.headers.get('content-type')}, Size: ${webImgBytes.length} bytes`);

  if (backendImgRes.status !== 200 || webImgRes.status !== 200) {
    throw new Error('Image fetch failed on backend or Next.js proxy');
  }

  console.log('\n=== CHECK 1 RESULT: SUCCESS (ALL VERIFICATIONS PASSED) ===');
  console.log(JSON.stringify({
    dishId: dbItem.id,
    dishName: dbItem.name,
    savedUrl: dbItem.imageUrl,
    diskPath,
    fileSize: fileStats.size,
    backendStatus: backendImgRes.status,
    nextStatus: webImgRes.status,
    storageLocation: 'Local disk (apps/backend/uploads/) with Next.js reverse proxy (/api/uploads/*)',
  }, null, 2));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\nCHECK 1 FAILED:', e);
  await prisma.$disconnect();
  process.exit(1);
});
