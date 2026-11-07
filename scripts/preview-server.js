const http = require('http');

const PORT = 4001;

const demoUser = {
  id: "u-admin",
  restaurantId: "rest-1",
  name: "Restaurant Owner / Cashier",
  roleId: "role-admin",
  roleName: "ADMIN",
  permissions: [
    "*",
    "sales.view", "dashboard.sales.view", "orders.create", "orders.edit", "orders.cancel", "orders.accept",
    "discounts.apply", "discounts.unlimited", "refunds.process", "orders.delete", "bills.print",
    "tables.view", "tables.manage", "menu.view", "menu.manage", "inventory.manage", "reports.access",
    "users.manage", "reports.financial.view", "data.export", "kds.manage", "reservations.manage",
    "settings.manage", "customers.manage", "audit_log.view", "roles.manage", "backup.manage",
    "attendance.manage", "delivery.manage", "delivery.rider", "staff.manage", "accounting.manage",
    "marketing.manage", "operations.manage", "system.update"
  ],
};

const demoBranch = {
  id: "branch-1",
  name: "Hotel Sanjog / EasyDine",
  code: "MAIN",
};

let restaurantSettings = {
  id: "rest-1",
  name: "Hotel Sanjog",
  legalName: "Hotel Sanjog Hospitality Pvt Ltd",
  logoUrl: null,
  currency: "INR",
  timezone: "Asia/Kolkata",
  upiVpa: "hotelsanjog@upi",
  upiPayeeName: "Hotel Sanjog",
  loyaltyPointValue: "1.00",
  loyaltyEarnPerCurrency: 100,
  referralEnabled: true,
  referralSharerPoints: 50,
  referralReferredPoints: 50,
  referralMinPurchase: "500.00",
  onlineMinOrderAmount: "0.00",
  onlinePriceAdjustKind: "PERCENT",
  onlinePriceAdjustValue: "0.00",
  maxManualDiscountPercent: "20.00",
  requireDiscountReason: true,
};

let branchSettings = {
  id: "branch-1",
  name: "Hotel Sanjog (Main Dining)",
  address: "Ahmednagar Locality, 1 km away",
  phone: "+91 98765 43210",
  gstNumber: "29AABCU9603R1ZM",
  country: "IN",
  taxRegime: "INDIA_GST",
  taxMode: "INCLUSIVE",
  taxLabel: "GST (5%)",
  taxId: "GST-5",
  autoConfirmOrders: false,
  autoConfirmReservations: true,
  kioskToken: "kiosk-demo-token",
  kioskDineInEnabled: true,
  kioskTakeawayEnabled: true,
  printerPaperWidthMm: 80,
  activeMenuId: "menu-1",
};

let demoCategories = [
  { id: "cat-1", name: "Starters & Appetizers", sortOrder: 1, isActive: true, showOnWebsite: true, _count: { items: 3 } },
  { id: "cat-2", name: "Main Course", sortOrder: 2, isActive: true, showOnWebsite: true, _count: { items: 3 } },
  { id: "cat-3", name: "Breads & Rice", sortOrder: 3, isActive: true, showOnWebsite: true, _count: { items: 2 } },
  { id: "cat-4", name: "Beverages & Drinks", sortOrder: 4, isActive: true, showOnWebsite: true, _count: { items: 2 } },
];

let demoMenuItems = [
  {
    id: "item-1",
    categoryId: "cat-1",
    stationId: "station-1",
    name: "Paneer Tikka (Charcoal Smoked)",
    description: "Cottage cheese marinated in aromatic spices and grilled in clay tandoor",
    price: "340.00",
    imageUrl: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=500&auto=format&fit=crop&q=80",
    isVeg: true,
    isActive: true,
    isCombo: false,
    category: { id: "cat-1", name: "Starters & Appetizers" },
    station: { id: "station-1", name: "Tandoor" },
    modifierGroups: [
      {
        modifierGroup: {
          id: "modg-1",
          name: "Spiciness Level",
          minSelect: 1,
          maxSelect: 1,
          isRequired: true,
          modifiers: [
            { id: "m-1", name: "Medium Spicy", priceAdjustment: "0.00", isDefault: true },
            { id: "m-2", name: "Extra Spicy", priceAdjustment: "0.00", isDefault: false },
            { id: "m-3", name: "Mild / Low Spice", priceAdjustment: "0.00", isDefault: false },
          ],
        },
      },
    ],
  },
  {
    id: "item-2",
    categoryId: "cat-1",
    stationId: "station-1",
    name: "Crispy Corn & Water Chestnut",
    description: "Golden fried sweet corn tossed with scallions and crushed black pepper",
    price: "290.00",
    imageUrl: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=80",
    isVeg: true,
    isActive: true,
    isCombo: false,
    category: { id: "cat-1", name: "Starters & Appetizers" },
    station: { id: "station-1", name: "Wok" },
    modifierGroups: [],
  },
  {
    id: "item-3",
    categoryId: "cat-1",
    stationId: "station-1",
    name: "Murgh Malai Kebab",
    description: "Tender chicken morsels with cream cheese, cardamom and mild herbs",
    price: "420.00",
    imageUrl: "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=500&auto=format&fit=crop&q=80",
    isVeg: false,
    isActive: true,
    isCombo: false,
    category: { id: "cat-1", name: "Starters & Appetizers" },
    station: { id: "station-1", name: "Tandoor" },
    modifierGroups: [],
  },
  {
    id: "item-4",
    categoryId: "cat-2",
    stationId: "station-1",
    name: "Dal Makhani (Slow Cooked 24h)",
    description: "Classic yellow & black lentils simmered overnight with ghee and aromatic spices",
    price: "280.00",
    imageUrl: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=80",
    isVeg: true,
    isActive: true,
    isCombo: false,
    category: { id: "cat-2", name: "Main Course" },
    station: { id: "station-1", name: "Curry" },
    modifierGroups: [],
  },
  {
    id: "item-5",
    categoryId: "cat-2",
    stationId: "station-1",
    name: "Veg Biryani (Clay Handi)",
    description: "Aromatic basmati rice cooked on slow dum with royal spices and vegetables",
    price: "267.00",
    imageUrl: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500&auto=format&fit=crop&q=80",
    isVeg: true,
    isActive: true,
    isCombo: false,
    category: { id: "cat-2", name: "Main Course" },
    station: { id: "station-1", name: "Curry" },
    modifierGroups: [],
  },
  {
    id: "item-6",
    categoryId: "cat-3",
    stationId: "station-1",
    name: "Butter Roti / Garlic Naan",
    description: "Soft tandoori flatbread brushed with fresh melted butter",
    price: "35.00",
    imageUrl: "https://images.unsplash.com/photo-1626074353765-517a681e40be?w=500&auto=format&fit=crop&q=80",
    isVeg: true,
    isActive: true,
    isCombo: false,
    category: { id: "cat-3", name: "Breads & Rice" },
    station: { id: "station-1", name: "Tandoor" },
    modifierGroups: [],
  },
  {
    id: "item-7",
    categoryId: "cat-4",
    stationId: "station-2",
    name: "Masala Lemonade Cooler",
    description: "Freshly squeezed lemon with roasted cumin, mint, and black salt",
    price: "120.00",
    imageUrl: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=80",
    isVeg: true,
    isActive: true,
    isCombo: false,
    category: { id: "cat-4", name: "Beverages & Drinks" },
    station: { id: "station-2", name: "Bar" },
    modifierGroups: [],
  },
];

let demoFloors = [
  {
    id: "floor-1",
    name: "Main Dining Hall",
    sortOrder: 1,
    tables: [
      { id: "tbl-1", floorId: "floor-1", number: "1", name: "Table 1 (Window)", capacity: 4, status: "OCCUPIED", statusSince: new Date(Date.now() - 35 * 60000).toISOString(), posX: 50, posY: 50, width: 80, height: 80, rotation: 0, shape: "square", qrToken: "qr-table-1", assignedWaiter: { id: "w-1", name: "Rajesh" } },
      { id: "tbl-2", floorId: "floor-1", number: "2", name: "Table 2", capacity: 4, status: "FREE", statusSince: new Date(Date.now() - 120 * 60000).toISOString(), posX: 180, posY: 50, width: 80, height: 80, rotation: 0, shape: "square", qrToken: "qr-table-2", assignedWaiter: null },
      { id: "tbl-3", floorId: "floor-1", number: "3", name: "Table 3", capacity: 6, status: "OCCUPIED", statusSince: new Date(Date.now() - 15 * 60000).toISOString(), posX: 310, posY: 50, width: 120, height: 80, rotation: 0, shape: "rect", qrToken: "qr-table-3", assignedWaiter: { id: "w-2", name: "Pooja" } },
      { id: "tbl-4", floorId: "floor-1", number: "4", name: "Table 4", capacity: 2, status: "FREE", statusSince: new Date(Date.now() - 40 * 60000).toISOString(), posX: 50, posY: 180, width: 60, height: 60, rotation: 0, shape: "round", qrToken: "qr-table-4", assignedWaiter: null },
      { id: "tbl-5", floorId: "floor-1", number: "5", name: "Table 5 (Booth)", capacity: 6, status: "RESERVED", statusSince: new Date(Date.now() - 10 * 60000).toISOString(), posX: 180, posY: 180, width: 120, height: 80, rotation: 0, shape: "rect", qrToken: "qr-table-5", assignedWaiter: null },
      { id: "tbl-6", floorId: "floor-1", number: "6", name: "Family Lounge", capacity: 8, status: "FREE", statusSince: new Date().toISOString(), posX: 330, posY: 180, width: 140, height: 90, rotation: 0, shape: "rect", qrToken: "qr-table-6", assignedWaiter: null },
    ],
  },
];

let openServiceRequests = [];
let demoNotifications = [];
let activeCustomerOrder = {
  orderNumber: "1042",
  status: "PREPARING",
  acceptance: "ACCEPTED",
  items: [
    { id: "pi-1", nameSnapshot: "Paneer Tikka (Charcoal Smoked)", quantity: 2, status: "PREPARING", kitchenNote: "Extra spicy" },
    { id: "pi-2", nameSnapshot: "Dal Makhani (Slow Cooked 24h)", quantity: 1, status: "ACCEPTED", kitchenNote: "No onion" },
  ],
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  res.setHeader("Access-Control-Allow-Origin", "http://localhost:1995");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const send = (data, status = 200) => {
    res.writeHead(status);
    res.end(JSON.stringify(data));
  };

  const getBody = () =>
    new Promise((resolve) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch {
          resolve({});
        }
      });
    });

  // Auth endpoints
  if (pathname.includes("/auth/setup-status")) {
    return send({ isSetup: true });
  }

  if (pathname.includes("/auth/me") || pathname.includes("/auth/login") || pathname.includes("/auth/register")) {
    return send({ user: demoUser });
  }

  if (pathname.includes("/branches")) {
    return send([demoBranch]);
  }

  // Dashboard endpoints
  if (pathname.includes("/dashboard/summary")) {
    return send({
      todayRevenue: 68420,
      todayOrders: 45,
      channels: { online: 27, offline: 18 },
      tables: { available: 4, occupied: 2, reserved: 1, cleaning: 0, outOfService: 0 },
      kitchenQueue: { new: 2, accepted: 3, preparing: 4, ready: 1 },
      pendingPayments: { count: openServiceRequests.includes("BILL") ? 1 : 0, balance: 1480 },
      lowStock: 2,
      customers: 41,
      employees: 8,
      unpaidPayrollRuns: 0,
      recentOrders: [
        { id: "ord-1", orderNumber: "1042", type: "DINE_IN", totalAmount: "1480.00", billedAt: new Date(Date.now() - 12 * 60000).toISOString() },
        { id: "ord-2", orderNumber: "1041", type: "DINE_IN", totalAmount: "890.00", billedAt: new Date(Date.now() - 25 * 60000).toISOString() },
      ],
    });
  }

  if (pathname.includes("/dashboard/trends")) {
    return send({
      revenue: Array.from({ length: 14 }).map((_, i) => ({
        date: new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(5, 10),
        amount: 35000 + Math.floor(Math.sin(i) * 12000) + i * 1800,
      })),
      waste: Array.from({ length: 14 }).map((_, i) => ({
        date: new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(5, 10),
        cost: 600 + (i % 3) * 250,
      })),
    });
  }

  // Tables
  if (pathname.includes("/tables/floors")) {
    return send(demoFloors);
  }

  // Menu Categories
  if (pathname.includes("/menu/categories")) {
    if (req.method === "POST") {
      return getBody().then((b) => {
        const newCat = { id: `cat-${Date.now()}`, name: b.name, sortOrder: demoCategories.length + 1, isActive: true, showOnWebsite: true, _count: { items: 0 } };
        demoCategories.push(newCat);
        return send(newCat, 201);
      });
    }
    return send(demoCategories);
  }

  // Menu Items CRUD (Dish image, specifications, pricing, sold-out)
  if (pathname.startsWith("/api/v1/menu/items")) {
    if (req.method === "POST") {
      return getBody().then((b) => {
        const cat = demoCategories.find((c) => c.id === b.categoryId);
        const newItem = {
          id: `item-${Date.now()}`,
          categoryId: b.categoryId,
          stationId: b.stationId || null,
          name: b.name,
          description: b.description || null,
          price: String(b.price || 0),
          halfPrice: b.halfPrice ? String(b.halfPrice) : null,
          taxRatePercent: String(b.taxRatePercent || 5),
          isVeg: !!b.isVeg,
          isActive: b.isActive !== false,
          isCombo: false,
          imageUrl: b.imageUrl || null,
          category: { id: b.categoryId, name: cat?.name || "General" },
          station: { id: b.stationId || "s-1", name: "Kitchen" },
          modifierGroups: [],
        };
        demoMenuItems.unshift(newItem);
        return send(newItem, 201);
      });
    }

    // Update dish
    if (req.method === "PUT" || req.method === "PATCH") {
      const parts = pathname.split("/");
      const id = parts[parts.length - 1];
      return getBody().then((b) => {
        const idx = demoMenuItems.findIndex((i) => i.id === id);
        if (idx >= 0) {
          demoMenuItems[idx] = {
            ...demoMenuItems[idx],
            name: b.name ?? demoMenuItems[idx].name,
            description: b.description !== undefined ? b.description : demoMenuItems[idx].description,
            price: b.price !== undefined ? String(b.price) : demoMenuItems[idx].price,
            halfPrice: b.halfPrice !== undefined ? (b.halfPrice ? String(b.halfPrice) : null) : demoMenuItems[idx].halfPrice,
            isVeg: b.isVeg !== undefined ? b.isVeg : demoMenuItems[idx].isVeg,
            isActive: b.isActive !== undefined ? b.isActive : demoMenuItems[idx].isActive,
            imageUrl: b.imageUrl !== undefined ? b.imageUrl : demoMenuItems[idx].imageUrl,
          };
          return send(demoMenuItems[idx]);
        }
        return send({ error: "Item not found" }, 404);
      });
    }

    if (req.method === "DELETE") {
      const parts = pathname.split("/");
      const id = parts[parts.length - 1];
      demoMenuItems = demoMenuItems.filter((i) => i.id !== id);
      return send({ success: true });
    }

    return send(demoMenuItems);
  }

  // Kitchen Stations & Tickets
  if (pathname.includes("/kds/stations")) {
    return send([
      { id: "station-1", name: "Main Kitchen / Tandoor" },
      { id: "station-2", name: "Bar & Beverages" },
    ]);
  }

  if (pathname.includes("/kds/tickets")) {
    return send([
      {
        id: "kot-1",
        orderId: "ord-1",
        stationId: "station-1",
        ticketNumber: "KOT-1042-1",
        status: "PREPARING",
        isPriority: false,
        printedCount: 1,
        lastPrintError: null,
        createdAt: new Date(Date.now() - 10 * 60000).toISOString(),
        station: { id: "station-1", name: "Main Kitchen" },
        order: {
          orderNumber: "1042",
          type: "DINE_IN",
          channel: "ONLINE",
          notes: "Customer at Table 1: Please hurry, kids are hungry",
          table: { number: "1", name: "Table 1 (Window)" },
          guestName: "Rahul Sharma",
          customer: null,
        },
        items: [
          {
            id: "koti-1",
            orderItem: {
              nameSnapshot: "Paneer Tikka (Charcoal Smoked)",
              quantity: 2,
              kitchenNote: "Extra spicy, crisp charred edges",
              modifiers: [{ nameSnapshot: "Extra Spicy" }],
            },
          },
          {
            id: "koti-2",
            orderItem: {
              nameSnapshot: "Dal Makhani (Slow Cooked 24h)",
              quantity: 1,
              kitchenNote: "Less butter on top",
              modifiers: [],
            },
          },
        ],
      },
    ]);
  }

  // Notifications (Call Waiter / Bill Alert to Cashier)
  if (pathname.includes("/notifications")) {
    return send({ data: demoNotifications, unreadCount: demoNotifications.filter((n) => !n.readAt).length });
  }

  // Display settings (Restaurant + Branch for UI headers, menus, dialogs)
  if (pathname.includes("/settings/display")) {
    return send({
      restaurant: restaurantSettings,
      branch: branchSettings,
    });
  }

  // Restaurant Settings
  if (pathname.includes("/settings/restaurant")) {
    if (req.method === "PUT" || req.method === "PATCH") {
      return getBody().then((b) => {
        restaurantSettings = { ...restaurantSettings, ...b };
        return send(restaurantSettings);
      });
    }
    return send(restaurantSettings);
  }

  // Branch Settings
  if (pathname.includes("/settings/branch/")) {
    if (req.method === "PUT" || req.method === "PATCH") {
      return getBody().then((b) => {
        branchSettings = { ...branchSettings, ...b };
        return send(branchSettings);
      });
    }
    return send(branchSettings);
  }

  // Upload image
  if (pathname.includes("/uploads/image")) {
    return send({ url: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=80" });
  }

  // Public QR Menu endpoint
  if (pathname.startsWith("/api/v1/public/menu/")) {
    if (pathname.endsWith("/status")) {
      return send({
        order: activeCustomerOrder,
        openRequests: openServiceRequests,
      });
    }

    if (req.method === "POST" && pathname.endsWith("/order")) {
      return getBody().then((b) => {
        const orderNum = String(1040 + Math.floor(Math.random() * 50));
        activeCustomerOrder = {
          orderNumber: orderNum,
          status: "ACCEPTED",
          acceptance: "ACCEPTED",
          items: (b.items || []).map((it, idx) => {
            const found = demoMenuItems.find((m) => m.id === it.menuItemId);
            return {
              id: `pi-${idx}`,
              nameSnapshot: found?.name || "Delicious Dish",
              quantity: it.quantity,
              status: "ACCEPTED",
              kitchenNote: it.kitchenNote,
            };
          }),
        };
        demoNotifications.unshift({
          id: `notif-${Date.now()}`,
          entity: "Order",
          entityId: `ord-${orderNum}`,
          title: `New Online Order #${orderNum}`,
          message: `${b.guestName || "Guest"} placed order at Table 1 (${activeCustomerOrder.items.length} items)`,
          createdAt: new Date().toISOString(),
          readAt: null,
        });
        return send({ orderNumber: orderNum });
      });
    }

    // Call Waiter or Request Bill from phone
    if (req.method === "POST" && pathname.endsWith("/request")) {
      return getBody().then((b) => {
        const type = b.type; // "WAITER" | "BILL"
        if (!openServiceRequests.includes(type)) {
          openServiceRequests.push(type);
        }
        demoNotifications.unshift({
          id: `notif-${Date.now()}`,
          entity: "ServiceRequest",
          entityId: "tbl-1",
          title: type === "WAITER" ? "🔔 Call Waiter Alert" : "🧾 Bill Requested",
          message: `Table 1 requested ${type === "WAITER" ? "waiter assistance" : "final bill"}`,
          createdAt: new Date().toISOString(),
          readAt: null,
        });
        return send({ success: true, openRequests: openServiceRequests });
      });
    }

    return send({
      branchName: restaurantSettings.name,
      tableName: "Table 1 (Window)",
      categories: demoCategories.map((c) => ({
        id: c.id,
        name: c.name,
        items: demoMenuItems.filter((i) => i.categoryId === c.id && i.isActive),
      })),
    });
  }

  // Fallbacks
  if (pathname.includes("/reservations")) return send([]);
  if (pathname.includes("/waitlist")) return send([]);
  if (pathname.includes("/roles")) return send([{ id: "role-admin", name: "Administrator", permissions: ["*"] }]);
  if (pathname.includes("/staff")) return send([{ id: "u-admin", name: "Restaurant Owner", email: "admin@easydine.com", roleName: "ADMIN", isActive: true }]);
  if (pathname.includes("/customers")) return send([]);
  if (pathname.includes("/orders")) return send([]);

  send({ status: "ok" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`EasyDine preview API service listening on http://0.0.0.0:${PORT}`);
});
