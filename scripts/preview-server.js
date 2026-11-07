const http = require('http');

const PORT = 4001;

const demoUser = {
  id: "u-admin",
  restaurantId: "rest-1",
  name: "Restaurant Owner / Cashier",
  roleId: "role-admin",
  roleName: "ADMIN",
  permissions: ["*"],
};

const demoBranch = {
  id: "branch-1",
  name: "EasyDine - Grand Central",
  code: "MAIN",
};

const demoCategories = [
  { id: "cat-1", name: "Starters & Appetizers", sortOrder: 1, isActive: true, showOnWebsite: true, _count: { items: 3 } },
  { id: "cat-2", name: "Main Course", sortOrder: 2, isActive: true, showOnWebsite: true, _count: { items: 3 } },
  { id: "cat-3", name: "Breads & Rice", sortOrder: 3, isActive: true, showOnWebsite: true, _count: { items: 2 } },
  { id: "cat-4", name: "Beverages & Drinks", sortOrder: 4, isActive: true, showOnWebsite: true, _count: { items: 2 } },
];

const demoMenuItems = [
  {
    id: "item-1",
    categoryId: "cat-1",
    stationId: "station-1",
    name: "Paneer Tikka (Charcoal Smoked)",
    description: "Cottage cheese marinated in aromatic spices and grilled in clay tandoor",
    price: "340.00",
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
            { id: "m-3", name: "Mild / Low Spice", priceAdjustment: "0.00", isDefault: false }
          ]
        }
      }
    ]
  },
  {
    id: "item-2",
    categoryId: "cat-1",
    stationId: "station-1",
    name: "Crispy Corn & Water Chestnut",
    description: "Golden fried sweet corn tossed with scallions and crushed black pepper",
    price: "290.00",
    isVeg: true,
    isActive: true,
    isCombo: false,
    category: { id: "cat-1", name: "Starters & Appetizers" },
    station: { id: "station-1", name: "Wok" },
    modifierGroups: []
  },
  {
    id: "item-3",
    categoryId: "cat-1",
    stationId: "station-1",
    name: "Murgh Malai Kebab",
    description: "Tender chicken morsels with cream cheese, cardamom and mild herbs",
    price: "420.00",
    isVeg: false,
    isActive: true,
    isCombo: false,
    category: { id: "cat-1", name: "Starters & Appetizers" },
    station: { id: "station-1", name: "Tandoor" },
    modifierGroups: []
  },
  {
    id: "item-4",
    categoryId: "cat-2",
    stationId: "station-1",
    name: "Dal Makhani (Slow Cooked 24h)",
    description: "Black lentils simmered overnight with butter and fresh cream",
    price: "360.00",
    isVeg: true,
    isActive: true,
    isCombo: false,
    category: { id: "cat-2", name: "Main Course" },
    station: { id: "station-1", name: "Curry" },
    modifierGroups: []
  },
  {
    id: "item-5",
    categoryId: "cat-2",
    stationId: "station-1",
    name: "Butter Chicken (Old Delhi Style)",
    description: "Tandoori chicken in velvety tomato and fenugreek gravy",
    price: "480.00",
    isVeg: false,
    isActive: true,
    isCombo: false,
    category: { id: "cat-2", name: "Main Course" },
    station: { id: "station-1", name: "Curry" },
    modifierGroups: []
  },
  {
    id: "item-6",
    categoryId: "cat-4",
    stationId: "station-2",
    name: "Masala Lemonade",
    description: "Freshly squeezed lemon with roasted cumin, mint, and black salt",
    price: "140.00",
    isVeg: true,
    isActive: true,
    isCombo: false,
    category: { id: "cat-4", name: "Beverages & Drinks" },
    station: { id: "station-2", name: "Bar" },
    modifierGroups: []
  }
];

const demoFloors = [
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
    ]
  }
];

const demoDashboardSummary = {
  todayRevenue: 64520,
  todayOrders: 42,
  channels: { online: 24, offline: 18 },
  tables: {
    available: 4,
    occupied: 2,
    reserved: 1,
    cleaning: 0,
    outOfService: 0
  },
  kitchenQueue: { new: 2, accepted: 3, preparing: 4, ready: 1 },
  pendingPayments: { count: 3, balance: 3450 },
  lowStock: 2,
  customers: 38,
  employees: 8,
  unpaidPayrollRuns: 0,
  recentOrders: [
    { id: "ord-1", orderNumber: "1042", type: "DINE_IN", totalAmount: "1480.00", billedAt: new Date(Date.now() - 12 * 60000).toISOString() },
    { id: "ord-2", orderNumber: "1041", type: "DINE_IN", totalAmount: "890.00", billedAt: new Date(Date.now() - 25 * 60000).toISOString() },
    { id: "ord-3", orderNumber: "1040", type: "TAKEAWAY", totalAmount: "640.00", billedAt: new Date(Date.now() - 48 * 60000).toISOString() },
    { id: "ord-4", orderNumber: "1039", type: "DINE_IN", totalAmount: "2150.00", billedAt: new Date(Date.now() - 70 * 60000).toISOString() }
  ]
};

const demoKotTickets = [
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
      notes: "Customer at Table 1: please keep mild for kid",
      table: { number: "1", name: "Table 1 (Window)" },
      guestName: "Vikram & Family",
      customer: null
    },
    items: [
      {
        id: "koti-1",
        orderItem: {
          nameSnapshot: "Paneer Tikka (Charcoal Smoked)",
          quantity: 2,
          kitchenNote: "Extra crisp, green chutney on side",
          modifiers: [{ nameSnapshot: "Medium Spicy" }]
        }
      },
      {
        id: "koti-2",
        orderItem: {
          nameSnapshot: "Dal Makhani",
          quantity: 1,
          kitchenNote: "Less butter on top",
          modifiers: []
        }
      }
    ]
  },
  {
    id: "kot-2",
    orderId: "ord-2",
    stationId: "station-1",
    ticketNumber: "KOT-1041-1",
    status: "READY",
    isPriority: true,
    printedCount: 1,
    lastPrintError: null,
    createdAt: new Date(Date.now() - 22 * 60000).toISOString(),
    station: { id: "station-1", name: "Main Kitchen" },
    order: {
      orderNumber: "1041",
      type: "DINE_IN",
      channel: "STAFF",
      notes: null,
      table: { number: "3", name: "Table 3" },
      guestName: "Amit Sharma",
      customer: null
    },
    items: [
      {
        id: "koti-3",
        orderItem: {
          nameSnapshot: "Butter Chicken (Old Delhi Style)",
          quantity: 1,
          kitchenNote: "Boneless portion",
          modifiers: []
        }
      }
    ]
  }
];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Set standard CORS & JSON headers
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

  // Response helper
  const send = (data, status = 200) => {
    res.writeHead(status);
    res.end(JSON.stringify(data));
  };

  // Route matches
  if (pathname.includes("/auth/setup-status")) {
    return send({ isSetup: true });
  }

  if (pathname.includes("/auth/me") || pathname.includes("/auth/login") || pathname.includes("/auth/register")) {
    return send({ user: demoUser });
  }

  if (pathname.includes("/branches")) {
    return send([demoBranch]);
  }

  if (pathname.includes("/dashboard/summary")) {
    return send(demoDashboardSummary);
  }

  if (pathname.includes("/dashboard/trends")) {
    const trends = {
      revenue: Array.from({ length: 14 }).map((_, i) => ({
        date: new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(5, 10),
        amount: 35000 + Math.floor(Math.sin(i) * 12000) + i * 1800
      })),
      waste: Array.from({ length: 14 }).map((_, i) => ({
        date: new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(5, 10),
        cost: 600 + (i % 3) * 250
      }))
    };
    return send(trends);
  }

  if (pathname.includes("/tables/floors")) {
    return send(demoFloors);
  }

  if (pathname.includes("/menu/categories")) {
    return send(demoCategories);
  }

  if (pathname.includes("/menu/items")) {
    return send(demoMenuItems);
  }

  if (pathname.includes("/kds/stations")) {
    return send([
      { id: "station-1", name: "Main Kitchen / Tandoor" },
      { id: "station-2", name: "Bar & Beverages" }
    ]);
  }

  if (pathname.includes("/kds/tickets")) {
    return send(demoKotTickets);
  }

  if (pathname.includes("/settings/restaurant")) {
    return send({
      id: "rest-1",
      name: "Easy Dine Restaurant",
      legalName: "Easy Dine Hospitality Pvt Ltd",
      logoUrl: null,
      currency: "INR",
      timezone: "Asia/Kolkata",
      upiVpa: "easydine@upi",
      upiPayeeName: "Easy Dine Restaurant",
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
      requireDiscountReason: true
    });
  }

  if (pathname.includes("/settings/branch/")) {
    return send({
      id: "branch-1",
      name: "EasyDine - Grand Central",
      address: "MG Road, Central District, Bengaluru",
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
      activeMenuId: "menu-1"
    });
  }

  // Public QR Menu endpoint (/public/menu/:qrToken)
  if (pathname.startsWith("/api/v1/public/menu/")) {
    if (pathname.endsWith("/status")) {
      return send({
        order: {
          orderNumber: "1042",
          status: "PREPARING",
          acceptance: "ACCEPTED",
          items: [
            { id: "pi-1", nameSnapshot: "Paneer Tikka (Charcoal Smoked)", quantity: 2, status: "PREPARING" },
            { id: "pi-2", nameSnapshot: "Dal Makhani", quantity: 1, status: "ACCEPTED" }
          ]
        },
        openRequests: []
      });
    }

    if (req.method === "POST" && pathname.endsWith("/order")) {
      return send({ orderNumber: "1043" });
    }

    if (req.method === "POST" && pathname.endsWith("/request")) {
      return send({ success: true });
    }

    return send({
      branchName: "Easy Dine Restaurant",
      tableName: "Table 1 (Window)",
      categories: [
        {
          id: "pcat-1",
          name: "Starters",
          items: demoMenuItems.filter(i => i.categoryId === "cat-1")
        },
        {
          id: "pcat-2",
          name: "Mains",
          items: demoMenuItems.filter(i => i.categoryId === "cat-2")
        },
        {
          id: "pcat-3",
          name: "Beverages",
          items: demoMenuItems.filter(i => i.categoryId === "cat-4")
        }
      ]
    });
  }

  // Notifications endpoint
  if (pathname.includes("/notifications")) {
    return send({ data: [], unreadCount: 0 });
  }

  // Fallback generic 200 OK for other endpoints (roles, staff, users, reservations, etc.)
  if (pathname.includes("/reservations")) {
    return send([]);
  }
  if (pathname.includes("/waitlist")) {
    return send([]);
  }
  if (pathname.includes("/roles")) {
    return send([{ id: "role-admin", name: "Administrator", permissions: ["*"] }]);
  }
  if (pathname.includes("/staff")) {
    return send([{ id: "u-admin", name: "Restaurant Owner", email: "admin@easydine.com", roleName: "ADMIN", isActive: true }]);
  }
  if (pathname.includes("/customers")) {
    return send([]);
  }
  if (pathname.includes("/orders")) {
    return send([]);
  }

  // Generic 200 default
  send({ status: "ok" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`EasyDine preview API service listening on http://0.0.0.0:${PORT}`);
});
