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
  logoUrl: "/logo.png",
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

let activeTableRequests = [
  {
    id: "req-1",
    type: "WAITER",
    createdAt: new Date(Date.now() - 3 * 60000).toISOString(),
    table: { id: "tbl-1", number: "1", name: "Table 1 (Window)" },
  },
];
let openServiceRequests = ["WAITER"];

let demoOrders = [
  {
    id: "ord-1042",
    orderNumber: "1042",
    type: "DINE_IN",
    status: "OPEN",
    channel: "ONLINE",
    acceptance: "ACCEPTED",
    tableId: "tbl-1",
    guestName: "siddharth",
    guestCount: 2,
    notes: "Serve piping hot",
    cancelReason: null,
    subtotal: "960.00",
    taxAmount: "48.00",
    discountAmount: "0.00",
    tipAmount: "0.00",
    totalAmount: "1008.00",
    createdAt: new Date(Date.now() - 25 * 60000).toISOString(),
    billedAt: null,
    table: { id: "tbl-1", name: "Table 1 (Window)", number: "1" },
    customer: { id: "cust-1", name: "siddharth", phone: "+91 9876543210" },
    items: [
      {
        id: "item-1",
        menuItemId: "item-1",
        nameSnapshot: "Paneer Tikka (Charcoal Smoked)",
        quantity: 2,
        unitPriceSnapshot: "340.00",
        lineTotal: "680.00",
        status: "PREPARING",
        kitchenNote: "Extra spicy",
        modifiers: [],
      },
      {
        id: "item-2",
        menuItemId: "item-4",
        nameSnapshot: "Dal Makhani (Slow Cooked 24h)",
        quantity: 1,
        unitPriceSnapshot: "280.00",
        lineTotal: "280.00",
        status: "ACCEPTED",
        kitchenNote: "No onion",
        modifiers: [],
      },
    ],
    kots: [
      {
        id: "kot-1",
        ticketNumber: 1,
        status: "PREPARING",
        notes: "Table 1 (Window)",
        createdAt: new Date(Date.now() - 20 * 60000).toISOString(),
        sentAt: new Date(Date.now() - 20 * 60000).toISOString(),
        items: [
          { id: "koti-1", nameSnapshot: "Paneer Tikka (Charcoal Smoked)", quantity: 2, status: "PREPARING" },
          { id: "koti-2", nameSnapshot: "Dal Makhani (Slow Cooked 24h)", quantity: 1, status: "ACCEPTED" },
        ],
      },
    ],
    payments: [],
  },
  {
    id: "ord-1043",
    orderNumber: "1043",
    type: "DINE_IN",
    status: "OPEN",
    channel: "STAFF",
    acceptance: "ACCEPTED",
    tableId: "tbl-3",
    guestName: "Amit Sharma",
    guestCount: 4,
    notes: null,
    cancelReason: null,
    subtotal: "840.00",
    taxAmount: "42.00",
    discountAmount: "0.00",
    tipAmount: "0.00",
    totalAmount: "882.00",
    createdAt: new Date(Date.now() - 15 * 60000).toISOString(),
    billedAt: null,
    table: { id: "tbl-3", name: "Table 3", number: "3" },
    customer: { id: "cust-2", name: "Amit Sharma", phone: "+91 9811223344" },
    items: [
      {
        id: "item-3",
        menuItemId: "item-3",
        nameSnapshot: "Murgh Malai Kebab",
        quantity: 2,
        unitPriceSnapshot: "420.00",
        lineTotal: "840.00",
        status: "SERVED",
        kitchenNote: "Mild spicy",
        modifiers: [],
      },
    ],
    kots: [
      {
        id: "kot-2",
        ticketNumber: 2,
        status: "SERVED",
        notes: "Table 3",
        createdAt: new Date(Date.now() - 14 * 60000).toISOString(),
        sentAt: new Date(Date.now() - 14 * 60000).toISOString(),
        items: [
          { id: "koti-3", nameSnapshot: "Murgh Malai Kebab", quantity: 2, status: "SERVED" },
        ],
      },
    ],
    payments: [],
  },
  {
    id: "ord-1041",
    orderNumber: "1041",
    type: "TAKEAWAY",
    status: "COMPLETED",
    channel: "STAFF",
    acceptance: "ACCEPTED",
    tableId: null,
    guestName: "Vikram Malhotra",
    guestCount: 1,
    notes: null,
    cancelReason: null,
    subtotal: "534.00",
    taxAmount: "26.70",
    discountAmount: "50.00",
    tipAmount: "0.00",
    totalAmount: "510.70",
    createdAt: new Date(Date.now() - 120 * 60000).toISOString(),
    billedAt: new Date(Date.now() - 100 * 60000).toISOString(),
    table: null,
    customer: { id: "cust-3", name: "Vikram Malhotra", phone: "+91 9988776655" },
    items: [
      {
        id: "item-4",
        menuItemId: "item-5",
        nameSnapshot: "Veg Biryani (Claypot)",
        quantity: 2,
        unitPriceSnapshot: "267.00",
        lineTotal: "534.00",
        status: "SERVED",
        kitchenNote: null,
        modifiers: [],
      },
    ],
    kots: [],
    payments: [
      {
        id: "pay-1",
        method: "UPI",
        amount: "510.70",
        tendered: "510.70",
        changeGiven: "0.00",
        createdAt: new Date(Date.now() - 100 * 60000).toISOString(),
      },
    ],
  },
];
let demoCoupons = [
  {
    id: "cpn-1",
    code: "EASY50",
    kind: "PERCENT",
    value: "50",
    minOrderAmount: "200",
    maxDiscount: "100",
    validUntil: null,
    usageLimit: 100,
    usedCount: 14,
    isActive: true,
  },
  {
    id: "cpn-2",
    code: "FLAT100",
    kind: "FLAT",
    value: "100",
    minOrderAmount: "500",
    maxDiscount: null,
    validUntil: null,
    usageLimit: 50,
    usedCount: 8,
    isActive: true,
  },
];

let demoCampaigns = [
  {
    id: "cmp-1",
    name: "Weekend Special Discount",
    channel: "WHATSAPP",
    segment: "ALL",
    message: "Enjoy 20% off on your favorite dishes at EasyDine this weekend! Show code WEEKEND20 at the counter.",
    lastSentAt: new Date(Date.now() - 48 * 3600000).toISOString(),
    lastSentCount: 42,
  },
  {
    id: "cmp-2",
    name: "Loyal Customers Treat",
    channel: "SMS",
    segment: "LOYAL",
    message: "Thank you for being our loyal guest! Enjoy a complimentary dessert on your next visit.",
    lastSentAt: null,
    lastSentCount: null,
  },
];

let demoPromotions = [
  {
    id: "pro-1",
    name: "Evening Happy Hours (4 PM - 7 PM)",
    kind: "PERCENT",
    value: "15",
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: "16:00",
    endTime: "19:00",
    isActive: true,
  },
];

let demoTickets = [
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
  {
    id: "kot-2",
    orderId: "ord-2",
    stationId: "station-1",
    ticketNumber: "KOT-1043-1",
    status: "NEW",
    isPriority: false,
    printedCount: 0,
    lastPrintError: null,
    createdAt: new Date(Date.now() - 3 * 60000).toISOString(),
    station: { id: "station-1", name: "Main Kitchen" },
    order: {
      orderNumber: "1043",
      type: "DINE_IN",
      channel: "ONLINE",
      notes: null,
      table: { number: "3", name: "Table 3" },
      guestName: "Ananya Deshmukh",
      customer: null,
    },
    items: [
      {
        id: "koti-3",
        orderItem: {
          nameSnapshot: "Veg Biryani (Clay Handi)",
          quantity: 1,
          kitchenNote: "Mild spicy",
          modifiers: [],
        },
      },
      {
        id: "koti-4",
        orderItem: {
          nameSnapshot: "Butter Roti / Garlic Naan",
          quantity: 2,
          kitchenNote: "Extra butter",
          modifiers: [],
        },
      },
    ],
  },
];

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

  // --- Dashboard preferences ---
  if (pathname.includes("/dashboard/preferences")) {
    return send({
      topOrder: ["kpis", "attention", "charts"],
      cardOrder: ["tables", "kitchen", "recent", "channels"],
      hidden: [],
      trendDays: 14,
    });
  }

  // --- Settings General ---
  if (pathname === "/api/v1/settings" || pathname === "/settings") {
    return send({
      restaurant: restaurantSettings,
      branch: branchSettings,
    });
  }

  // --- Restaurant logo upload ---
  if (pathname.includes("/settings/restaurant/logo")) {
    const url = "/logo.png";
    restaurantSettings.logoUrl = url;
    return send({ url });
  }

  // --- Table Status Update ---
  if (pathname.includes("/tables/") && pathname.includes("/status")) {
    const parts = pathname.split("/");
    const tIndex = parts.indexOf("tables");
    const tableId = tIndex !== -1 && parts[tIndex + 1] ? parts[tIndex + 1].split("?")[0] : null;
    return getBody().then((b) => {
      for (const floor of demoFloors) {
        const table = floor.tables.find((t) => t.id === tableId);
        if (table) {
          table.status = b.status;
          table.statusSince = new Date().toISOString();
          return send(table);
        }
      }
      return send({ success: true });
    });
  }

  // --- Table Layout updates (drag-and-drop posX, posY persistence) ---
  if (pathname.includes("/tables/layout") && req.method === "PATCH") {
    return getBody().then((updates) => {
      const list = Array.isArray(updates) ? updates : [updates];
      for (const u of list) {
        for (const floor of demoFloors) {
          const table = floor.tables.find((t) => t.id === u.id);
          if (table) {
            if (u.posX !== undefined) table.posX = u.posX;
            if (u.posY !== undefined) table.posY = u.posY;
            if (u.width !== undefined) table.width = u.width;
            if (u.height !== undefined) table.height = u.height;
            if (u.rotation !== undefined) table.rotation = u.rotation;
          }
        }
      }
      return send({ success: true, count: list.length });
    });
  }

  // --- Table QR Token rotation / generation ---
  if (pathname.includes("/tables/") && pathname.includes("/qr-token") && req.method === "POST") {
    const parts = pathname.split("/");
    const tIndex = parts.indexOf("tables");
    const tableId = tIndex !== -1 && parts[tIndex + 1] ? parts[tIndex + 1].split("?")[0] : null;
    for (const floor of demoFloors) {
      const table = floor.tables.find((t) => t.id === tableId);
      if (table) {
        table.qrToken = `table-${table.number.toLowerCase()}-${Date.now().toString(36)}`;
        return send(table);
      }
    }
    return send({ id: tableId, qrToken: `table-${Date.now().toString(36)}` });
  }

  // --- Table Service Requests (Call Waiter / Request Bill) ---
  if (pathname.includes("/tables/requests")) {
    if (pathname.includes("/resolve") && req.method === "PATCH") {
      const parts = pathname.split("/");
      const rIndex = parts.indexOf("requests");
      const reqId = rIndex !== -1 && parts[rIndex + 1] ? parts[rIndex + 1].split("?")[0] : null;
      activeTableRequests = activeTableRequests.filter((r) => r.id !== reqId);
      if (!activeTableRequests.some((r) => r.type === "WAITER")) {
        openServiceRequests = openServiceRequests.filter((t) => t !== "WAITER");
      }
      if (!activeTableRequests.some((r) => r.type === "BILL")) {
        openServiceRequests = openServiceRequests.filter((t) => t !== "BILL");
      }
      return send({ success: true });
    }
    return send(activeTableRequests);
  }

  // --- Table CRUD ---
  if (pathname.startsWith("/api/v1/tables") && !pathname.includes("/floors") && !pathname.includes("/requests") && !pathname.includes("/layout")) {
    const parts = pathname.split("/");
    const tIndex = parts.indexOf("tables");
    const tableId = tIndex !== -1 && parts[tIndex + 1] ? parts[tIndex + 1].split("?")[0] : null;

    if (req.method === "POST" && !tableId) {
      return getBody().then((b) => {
        const floor = demoFloors.find((f) => f.id === b.floorId) || demoFloors[0];
        const newTable = {
          id: `tbl-${Date.now()}`,
          floorId: floor.id,
          number: String(b.number || floor.tables.length + 1),
          name: b.name || `Table ${floor.tables.length + 1}`,
          capacity: Number(b.capacity || 4),
          status: "FREE",
          statusSince: new Date().toISOString(),
          posX: b.posX || 100,
          posY: b.posY || 100,
          width: b.width || 80,
          height: b.height || 80,
          rotation: 0,
          shape: b.shape || "square",
          qrToken: `table-${Date.now().toString(36)}`,
          assignedWaiter: null,
        };
        floor.tables.push(newTable);
        return send(newTable, 201);
      });
    }

    if (tableId && req.method === "PATCH" && !pathname.includes("/status")) {
      return getBody().then((b) => {
        for (const floor of demoFloors) {
          const table = floor.tables.find((t) => t.id === tableId);
          if (table) {
            Object.assign(table, b);
            return send(table);
          }
        }
        return send({ error: "Table not found" }, 404);
      });
    }

    if (tableId && req.method === "DELETE") {
      for (const floor of demoFloors) {
        floor.tables = floor.tables.filter((t) => t.id !== tableId);
      }
      return send({ success: true });
    }
  }

  // --- Bill Preview & Coupon Discounts ---
  if (pathname.includes("/bill-preview")) {
    return getBody().then((b) => {
      const subtotal = 700;
      let discountAmount = 0;
      let couponCode = b.couponCode ? String(b.couponCode).toUpperCase() : null;
      let matchedCoupon = null;

      if (couponCode) {
        matchedCoupon = demoCoupons.find((c) => c.code.toUpperCase() === couponCode && c.isActive);
        if (matchedCoupon) {
          discountAmount = matchedCoupon.kind === "PERCENT"
            ? (subtotal * Number(matchedCoupon.value)) / 100
            : Number(matchedCoupon.value);
        } else {
          discountAmount = 50; // generic preview fallback
        }
      } else if (b.discountPercent) {
        discountAmount = (subtotal * b.discountPercent) / 100;
      } else if (b.discountFlat) {
        discountAmount = b.discountFlat;
      }

      const taxAmount = Math.max(0, (subtotal - discountAmount) * 0.05);
      const totalDue = Math.max(0, subtotal - discountAmount + taxAmount + (b.tipAmount || 0));

      return send({
        locked: false,
        status: "OPEN",
        subtotal: subtotal,
        discountAmount: discountAmount,
        discountPercent: matchedCoupon?.kind === "PERCENT" ? Number(matchedCoupon.value) : (b.discountPercent || 0),
        discountType: matchedCoupon?.kind || (b.discountPercent ? "PERCENT" : (b.discountFlat ? "FIXED" : null)),
        discountValue: discountAmount,
        couponCode: couponCode,
        promotionName: null,
        taxAmount: taxAmount,
        loyaltyPointsRedeemed: b.loyaltyPointsToRedeem || 0,
        loyaltyDiscountAmount: (b.loyaltyPointsToRedeem || 0) * 1,
        tipAmount: b.tipAmount || 0,
        deliveryFee: 0,
        totalDue: totalDue,
        amountPaid: 0,
        balanceDue: totalDue,
      });
    });
  }

  // --- Marketing: Coupons ---
  if (pathname.includes("/marketing/coupons")) {
    const parts = pathname.split("/");
    const cIndex = parts.indexOf("coupons");
    const couponId = cIndex !== -1 && parts[cIndex + 1] ? parts[cIndex + 1].split("?")[0] : null;

    if (req.method === "POST") {
      return getBody().then((b) => {
        const newCpn = {
          id: `cpn-${Date.now()}`,
          code: String(b.code || "DISCOUNT").toUpperCase(),
          kind: b.kind || "PERCENT",
          value: String(b.value || "10"),
          minOrderAmount: String(b.minOrderAmount || "0"),
          maxDiscount: null,
          validUntil: null,
          usageLimit: b.usageLimit ? Number(b.usageLimit) : null,
          usedCount: 0,
          isActive: true,
        };
        demoCoupons.unshift(newCpn);
        return send(newCpn, 201);
      });
    }

    if (couponId && req.method === "PATCH") {
      return getBody().then((b) => {
        const found = demoCoupons.find((c) => c.id === couponId);
        if (found) {
          if (b.isActive !== undefined) found.isActive = b.isActive;
        }
        return send(found || { success: true });
      });
    }

    if (couponId && req.method === "DELETE") {
      demoCoupons = demoCoupons.filter((c) => c.id !== couponId);
      return send({ success: true });
    }

    return send(demoCoupons);
  }

  // --- Marketing: Campaigns (SMS, WhatsApp, Email) ---
  if (pathname.includes("/marketing/campaigns")) {
    const parts = pathname.split("/");
    const cIndex = parts.indexOf("campaigns");
    const campaignId = cIndex !== -1 && parts[cIndex + 1] ? parts[cIndex + 1].split("?")[0] : null;

    if (pathname.includes("/audience")) {
      return send({ count: 48 });
    }

    if (campaignId && pathname.includes("/send")) {
      const found = demoCampaigns.find((c) => c.id === campaignId);
      if (found) {
        found.lastSentAt = new Date().toISOString();
        found.lastSentCount = 48;
      }
      return send({ sent: 48, failed: 0 });
    }

    if (req.method === "POST") {
      return getBody().then((b) => {
        const newCmp = {
          id: `cmp-${Date.now()}`,
          name: b.name || "Special Campaign",
          channel: b.channel || "WHATSAPP",
          segment: b.segment || "ALL",
          message: b.message || "",
          lastSentAt: null,
          lastSentCount: null,
        };
        demoCampaigns.unshift(newCmp);
        return send(newCmp, 201);
      });
    }

    if (campaignId && req.method === "DELETE") {
      demoCampaigns = demoCampaigns.filter((c) => c.id !== campaignId);
      return send({ success: true });
    }

    return send(demoCampaigns);
  }

  // --- Marketing: Promotions (Happy Hour) ---
  if (pathname.includes("/marketing/promotions")) {
    const parts = pathname.split("/");
    const pIndex = parts.indexOf("promotions");
    const promoId = pIndex !== -1 && parts[pIndex + 1] ? parts[pIndex + 1].split("?")[0] : null;

    if (req.method === "POST") {
      return getBody().then((b) => {
        const newPromo = {
          id: `pro-${Date.now()}`,
          name: b.name || "Happy Hour",
          kind: b.kind || "PERCENT",
          value: String(b.value || "10"),
          daysOfWeek: b.daysOfWeek || [1, 2, 3, 4, 5],
          startTime: b.startTime || "16:00",
          endTime: b.endTime || "19:00",
          isActive: true,
        };
        demoPromotions.push(newPromo);
        return send(newPromo, 201);
      });
    }

    if (promoId && req.method === "PATCH") {
      return getBody().then((b) => {
        const found = demoPromotions.find((p) => p.id === promoId);
        if (found && b.isActive !== undefined) found.isActive = b.isActive;
        return send(found || { success: true });
      });
    }

    if (promoId && req.method === "DELETE") {
      demoPromotions = demoPromotions.filter((p) => p.id !== promoId);
      return send({ success: true });
    }

    return send(demoPromotions);
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
      lowStock: null,
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
  if (pathname.includes("/stations")) {
    return send([
      { id: "station-1", name: "Main Kitchen / Tandoor" },
      { id: "station-2", name: "Bar & Beverages" },
    ]);
  }

  if (pathname.includes("/kds/tickets")) {
    const parts = pathname.split("/");
    const tIndex = parts.indexOf("tickets");
    const ticketId = tIndex !== -1 && parts[tIndex + 1] ? parts[tIndex + 1].split("?")[0] : null;

    if (ticketId && req.method === "PATCH" && pathname.includes("/status")) {
      return getBody().then((b) => {
        const found = demoTickets.find((t) => t.id === ticketId);
        if (found) {
          found.status = b.status;
        }
        return send(found || { success: true });
      });
    }

    if (ticketId && req.method === "PATCH" && pathname.includes("/priority")) {
      return getBody().then((b) => {
        const found = demoTickets.find((t) => t.id === ticketId);
        if (found) {
          found.isPriority = b.isPriority;
        }
        return send(found || { success: true });
      });
    }

    if (ticketId && req.method === "POST" && (pathname.includes("/print") || pathname.includes("/reprint"))) {
      const found = demoTickets.find((t) => t.id === ticketId);
      if (found) {
        found.printedCount = (found.printedCount || 0) + 1;
      }
      return send({ success: true, printedCount: found ? found.printedCount : 1 });
    }

    if (ticketId && req.method === "POST" && pathname.includes("/reject")) {
      const found = demoTickets.find((t) => t.id === ticketId);
      if (found) {
        found.status = "REJECTED";
      }
      return send({ success: true });
    }

    return send(demoTickets.filter((t) => t.status !== "SERVED" && t.status !== "REJECTED" && t.status !== "CANCELLED"));
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
  if (pathname.includes("/upload")) {
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
        const items = (b.items || []).map((it, idx) => {
          const found = demoMenuItems.find((m) => m.id === it.menuItemId);
          const price = found ? parseFloat(found.price) : 250;
          return {
            id: `ord-item-${Date.now()}-${idx}`,
            menuItemId: it.menuItemId,
            nameSnapshot: found?.name || "Delicious Dish",
            quantity: it.quantity,
            unitPriceSnapshot: price.toFixed(2),
            lineTotal: (price * it.quantity).toFixed(2),
            status: "ACCEPTED",
            kitchenNote: it.kitchenNote || null,
            modifiers: [],
          };
        });
        const subtotal = items.reduce((sum, it) => sum + parseFloat(it.lineTotal), 0);
        const tax = subtotal * 0.05;
        const total = subtotal + tax;

        const newOrder = {
          id: `ord-${orderNum}`,
          orderNumber: orderNum,
          type: "DINE_IN",
          status: "OPEN",
          channel: "ONLINE",
          acceptance: "ACCEPTED",
          tableId: "tbl-1",
          guestName: b.guestName || "siddharth",
          guestCount: 2,
          notes: b.note || null,
          cancelReason: null,
          subtotal: subtotal.toFixed(2),
          taxAmount: tax.toFixed(2),
          discountAmount: "0.00",
          tipAmount: "0.00",
          totalAmount: total.toFixed(2),
          createdAt: new Date().toISOString(),
          billedAt: null,
          table: { id: "tbl-1", name: "Table 1 (Window)", number: "1" },
          customer: { id: `cust-${Date.now()}`, name: b.guestName || "siddharth", phone: "+91 9876543210" },
          items,
          kots: [
            {
              id: `kot-${Date.now()}`,
              ticketNumber: demoOrders.length + 1,
              status: "ACCEPTED",
              notes: "Table 1 (Window) - QR Order",
              createdAt: new Date().toISOString(),
              sentAt: new Date().toISOString(),
              items: items.map((it) => ({
                id: `koti-${it.id}`,
                nameSnapshot: it.nameSnapshot,
                quantity: it.quantity,
                status: "ACCEPTED",
              })),
            },
          ],
          payments: [],
        };

        demoOrders.unshift(newOrder);

        activeCustomerOrder = {
          orderNumber: orderNum,
          status: "ACCEPTED",
          acceptance: "ACCEPTED",
          items: items.map((it) => ({
            id: it.id,
            nameSnapshot: it.nameSnapshot,
            quantity: it.quantity,
            status: "ACCEPTED",
            kitchenNote: it.kitchenNote,
          })),
        };

        demoNotifications.unshift({
          id: `notif-${Date.now()}`,
          entity: "Order",
          entityId: `ord-${orderNum}`,
          title: `New Online Order #${orderNum} — Table 1 (Window)`,
          body: `${b.guestName || "Guest"} placed order at Table 1 (${items.length} items • ₹${total.toFixed(2)})`,
          message: `${b.guestName || "Guest"} placed order at Table 1 (${items.length} items)`,
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
        activeTableRequests.unshift({
          id: `req-${Date.now()}`,
          type,
          createdAt: new Date().toISOString(),
          table: { id: "tbl-1", number: "1", name: "Table 1 (Window)" },
        });
        demoNotifications.unshift({
          id: `notif-${Date.now()}`,
          entity: "ServiceRequest",
          entityId: "tbl-1",
          title: type === "WAITER" ? "🔔 Table 1 (Window) — Waiter Called" : "🧾 Table 1 (Window) — Bill Requested",
          body: `Table 1 (Window) requested ${type === "WAITER" ? "waiter assistance" : "final bill"}`,
          message: `Table 1 (Window) requested ${type === "WAITER" ? "waiter assistance" : "final bill"}`,
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

  // --- Orders Management & POS Endpoints ---
  if (pathname.includes("/orders/manage")) {
    const tab = url.searchParams.get("tab") || "active";
    const channel = url.searchParams.get("channel");
    const type = url.searchParams.get("type");

    let list = demoOrders.filter((o) => {
      if (tab === "pending") {
        return o.status === "OPEN" && o.acceptance === "PENDING";
      }
      if (tab === "active") {
        return o.status === "OPEN" && o.acceptance !== "PENDING";
      }
      if (tab === "history") {
        return o.status === "COMPLETED" || o.status === "CANCELLED" || o.status === "BILLED";
      }
      return true;
    });

    if (channel) {
      list = list.filter((o) => o.channel === channel);
    }
    if (type) {
      list = list.filter((o) => o.type === type);
    }

    const mapped = list.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      type: o.type,
      status: o.status,
      channel: o.channel,
      acceptance: o.acceptance,
      guestName: o.guestName,
      totalAmount: o.totalAmount,
      createdAt: o.createdAt,
      table: o.table ? { id: o.table.id, name: o.table.name, number: parseInt(o.table.number, 10) || 1 } : null,
      customer: o.customer,
      items: (o.items || []).map((it) => ({
        id: it.id,
        nameSnapshot: it.nameSnapshot,
        quantity: it.quantity,
      })),
    }));

    return send(mapped);
  }

  if (pathname.includes("/orders/open-for-table/")) {
    const tableId = pathname.split("/").pop().split("?")[0];
    const order = demoOrders.find((o) => o.tableId === tableId && o.status === "OPEN");
    return send(order || null);
  }

  if (pathname.match(/\/orders\/[^/]+\/accept/)) {
    const parts = pathname.split("/");
    const id = parts[parts.indexOf("orders") + 1];
    const order = demoOrders.find((o) => o.id === id || o.orderNumber === id);
    if (order) {
      order.acceptance = "ACCEPTED";
      order.status = "OPEN";
      return send({ ok: true, order });
    }
    return send({ ok: true });
  }

  if (pathname.match(/\/orders\/[^/]+\/reject/)) {
    const parts = pathname.split("/");
    const id = parts[parts.indexOf("orders") + 1];
    const order = demoOrders.find((o) => o.id === id || o.orderNumber === id);
    if (order) {
      order.acceptance = "REJECTED";
      order.status = "CANCELLED";
      return send({ ok: true, order });
    }
    return send({ ok: true });
  }

  if (pathname.match(/\/orders\/[^/]+\/cancel/)) {
    const parts = pathname.split("/");
    const id = parts[parts.indexOf("orders") + 1];
    const order = demoOrders.find((o) => o.id === id || o.orderNumber === id);
    if (order) {
      order.status = "CANCELLED";
      return send({ ok: true, order });
    }
    return send({ ok: true });
  }

  if (pathname.match(/\/orders\/[^/]+\/bill-preview/)) {
    const parts = pathname.split("/");
    const id = parts[parts.indexOf("orders") + 1];
    const order = demoOrders.find((o) => o.id === id || o.orderNumber === id);
    const subtotal = order ? parseFloat(order.subtotal) : 960;
    const tax = subtotal * 0.05;
    return send({
      locked: false,
      status: order ? order.status : "OPEN",
      subtotal,
      discountAmount: 0,
      discountPercent: 0,
      discountType: null,
      discountValue: null,
      couponCode: null,
      promotionName: null,
      taxAmount: tax,
      loyaltyPointsRedeemed: 0,
      loyaltyDiscountAmount: 0,
      tipAmount: 0,
      deliveryFee: 0,
      totalDue: subtotal + tax,
      amountPaid: 0,
      balanceDue: subtotal + tax,
    });
  }

  if (pathname.match(/\/orders\/[^/]+\/checkout/)) {
    const parts = pathname.split("/");
    const id = parts[parts.indexOf("orders") + 1];
    const order = demoOrders.find((o) => o.id === id || o.orderNumber === id);
    if (order) {
      order.status = "COMPLETED";
      order.billedAt = new Date().toISOString();
    }
    const total = order ? parseFloat(order.totalAmount) : 1008;
    return send({
      id: order ? order.id : `ord-${id}`,
      orderNumber: order ? order.orderNumber : id,
      subtotal: order ? order.subtotal : "960.00",
      taxAmount: order ? order.taxAmount : "48.00",
      discountAmount: "0.00",
      tipAmount: "0.00",
      loyaltyPointsRedeemed: 0,
      loyaltyDiscountAmount: "0.00",
      totalAmount: order ? order.totalAmount : "1008.00",
      status: "COMPLETED",
      settlement: {
        amountDue: total,
        amountPaid: total,
        balanceDue: 0,
        changeDue: 0,
        fullyPaid: true,
      },
    });
  }

  if (pathname.match(/\/orders\/[^/]+\/print\/kot/)) {
    return send({
      ok: true,
      printed: [{ id: "kot-1", ticketNumber: "1", reprint: 0 }],
      escpos: ["1b40", "1b6101", "4b4f54205469636b6574", "0a", "1d5600"],
    });
  }

  if (pathname.match(/\/orders\/[^/]+\/print\/usb/)) {
    return send({
      ok: true,
      unsupportedChars: [],
      escpos: ["1b40", "1b6101", "42696c6c20536c6970", "0a", "1d5600"],
    });
  }

  if (req.method === "POST" && pathname.endsWith("/orders")) {
    return getBody().then((b) => {
      const orderNum = String(1040 + Math.floor(Math.random() * 50));
      const items = (b.items || []).map((it, idx) => {
        const found = demoMenuItems.find((m) => m.id === it.menuItemId);
        const price = found ? parseFloat(found.price) : 250;
        return {
          id: `ord-item-${Date.now()}-${idx}`,
          menuItemId: it.menuItemId,
          nameSnapshot: found?.name || "Dish",
          quantity: it.quantity,
          unitPriceSnapshot: price.toFixed(2),
          lineTotal: (price * it.quantity).toFixed(2),
          status: "ACCEPTED",
          kitchenNote: it.kitchenNote || null,
          modifiers: it.modifiers || [],
        };
      });
      const subtotal = items.reduce((sum, it) => sum + parseFloat(it.lineTotal), 0);
      const tax = subtotal * 0.05;
      const total = subtotal + tax;

      const order = {
        id: `ord-${orderNum}`,
        orderNumber: orderNum,
        type: b.type || "DINE_IN",
        status: "OPEN",
        channel: "STAFF",
        acceptance: "ACCEPTED",
        tableId: b.tableId || null,
        guestName: b.guestName || "Walk-in Guest",
        guestCount: b.guestCount || 1,
        notes: b.notes || null,
        cancelReason: null,
        subtotal: subtotal.toFixed(2),
        taxAmount: tax.toFixed(2),
        discountAmount: "0.00",
        tipAmount: "0.00",
        totalAmount: total.toFixed(2),
        createdAt: new Date().toISOString(),
        billedAt: null,
        table: b.tableId ? { id: b.tableId, name: `Table ${b.tableId}`, number: "1" } : null,
        customer: b.customerId ? { id: b.customerId, name: "Customer", phone: "" } : null,
        items,
        kots: [],
        payments: [],
      };

      demoOrders.unshift(order);
      return send({
        id: order.id,
        orderNumber: order.orderNumber,
        subtotal: order.subtotal,
        taxAmount: order.taxAmount,
        discountAmount: order.discountAmount,
        tipAmount: order.tipAmount,
        loyaltyPointsRedeemed: 0,
        loyaltyDiscountAmount: "0.00",
        totalAmount: order.totalAmount,
        status: "OPEN",
      });
    });
  }

  // Single order detail
  if (req.method === "GET" && pathname.match(/\/orders\/([^/?]+)$/)) {
    const parts = pathname.split("/");
    const id = parts[parts.length - 1].split("?")[0];
    if (id !== "manage" && id !== "print" && id !== "export") {
      const order = demoOrders.find((o) => o.id === id || o.orderNumber === id);
      if (order) {
        return send(order);
      }
      // If not found in demo, return a realistic fallback order so nothing crashes
      return send({
        id,
        orderNumber: id.replace("ord-", ""),
        type: "DINE_IN",
        status: "OPEN",
        channel: "ONLINE",
        acceptance: "ACCEPTED",
        tableId: "tbl-1",
        guestName: "Guest",
        guestCount: 2,
        notes: null,
        cancelReason: null,
        subtotal: "620.00",
        taxAmount: "31.00",
        discountAmount: "0.00",
        tipAmount: "0.00",
        totalAmount: "651.00",
        createdAt: new Date().toISOString(),
        billedAt: null,
        table: { id: "tbl-1", name: "Table 1 (Window)", number: "1" },
        customer: { id: "cust-1", name: "Guest", phone: "" },
        items: [
          {
            id: "it-fallback-1",
            menuItemId: "item-1",
            nameSnapshot: "Paneer Tikka (Charcoal Smoked)",
            quantity: 1,
            unitPriceSnapshot: "340.00",
            lineTotal: "340.00",
            status: "ACCEPTED",
            kitchenNote: null,
            modifiers: [],
          },
          {
            id: "it-fallback-2",
            menuItemId: "item-4",
            nameSnapshot: "Dal Makhani (Slow Cooked 24h)",
            quantity: 1,
            unitPriceSnapshot: "280.00",
            lineTotal: "280.00",
            status: "ACCEPTED",
            kitchenNote: null,
            modifiers: [],
          },
        ],
        kots: [],
        payments: [],
      });
    }
  }

  // --- Thermal & Kitchen Printer Services ---
  if (pathname.includes("/orders/print/diagnostics")) {
    return send({
      connection: "USB",
      network: null,
      lpDevices: ["USB-POS-Thermal-80mm"],
      libusbPrinter: { vendorId: 1155, productId: 22304, id: "POS-80" },
      canPrint: true,
      notes: ["Thermal receipt printer ready and connected via USB/Bluetooth."],
    });
  }

  if (pathname.includes("/orders/print/test") || pathname.includes("/printer/test")) {
    return send({ ok: true, escpos: ["1b40", "1b6101", "4561737944696e652054657374", "0a", "1d5600"] });
  }

  if (pathname.includes("/printer/test-kot")) {
    return send({ ok: true, escpos: ["1b40", "1b6101", "4b4f542054657374", "0a", "1d5600"] });
  }

  if (pathname.includes("/orders/print/drawer")) {
    return send({ ok: true });
  }

  if (pathname.includes("/print/usb")) {
    return send({ ok: true, unsupportedChars: [] });
  }

  // ==========================================
  // Comprehensive EasyDine Module Endpoints
  // ==========================================

  // --- 1. Inventory & Recipes ---
  if (pathname.includes("/inventory/menu-items/") && pathname.includes("/recipe")) {
    if (req.method === "PATCH") {
      return getBody().then((b) => send({ lines: b.lines || [], totalCost: 0 }));
    }
    return send({ lines: [], totalCost: 0 });
  }

  if (pathname.includes("/inventory/menu-items/") && pathname.includes("/tracking")) {
    if (req.method === "PATCH") {
      return getBody().then((b) => send({
        id: "trk-1",
        inventoryTracking: b.inventoryTracking || "NONE",
        stockIngredientId: b.stockIngredientId || null,
        stockQuantityPerSale: b.stockQuantityPerSale || 1,
        isCombo: false,
      }));
    }
    return send({
      id: "trk-1",
      inventoryTracking: "NONE",
      stockIngredientId: null,
      stockQuantityPerSale: 1,
      isCombo: false,
    });
  }

  if (pathname.includes("/inventory/tracking-status")) {
    return send({ tracked: demoMenuItems.length, untracked: 0, problems: [] });
  }

  if (pathname.includes("/inventory/ingredients")) {
    return send([
      { id: "ing-1", name: "Paneer (Fresh Farm)", unit: "KG", currentStock: 15, minimumStock: 5, costPerUnit: 350 },
      { id: "ing-2", name: "Basmati Rice (Royal)", unit: "KG", currentStock: 40, minimumStock: 10, costPerUnit: 120 },
      { id: "ing-3", name: "Butter (Amul)", unit: "KG", currentStock: 8, minimumStock: 2, costPerUnit: 520 },
      { id: "ing-4", name: "Chicken Breast", unit: "KG", currentStock: 25, minimumStock: 8, costPerUnit: 280 },
    ]);
  }

  if (pathname.includes("/inventory/suppliers")) {
    return send([
      { id: "sup-1", name: "Metro Cash & Carry", phone: "9876543201", email: "orders@metro.com", active: true },
      { id: "sup-2", name: "Dairy Fresh Farms", phone: "9876543202", email: "sales@dairyfresh.com", active: true },
    ]);
  }

  if (pathname.includes("/inventory")) {
    return send([]);
  }

  // --- 2. HR, Team & Shifts ---
  if (pathname.includes("/hr")) {
    if (pathname.includes("/pay")) {
      return send([
        {
          userId: "u-admin",
          name: "Restaurant Owner",
          basePay: 50000,
          frequency: "MONTHLY",
          hourlyRate: 300,
          salaryMonthly: 50000,
        },
        {
          userId: "u-cashier",
          name: "Lead Cashier",
          basePay: 25000,
          frequency: "MONTHLY",
          hourlyRate: 150,
          salaryMonthly: 25000,
        },
      ]);
    }
    if (pathname.includes("/shifts")) {
      return send([
        {
          id: "shift-1",
          userId: "u-cashier",
          user: { id: "u-cashier", name: "Lead Cashier" },
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 8 * 3600000).toISOString(),
        },
      ]);
    }
    if (pathname.includes("/leave")) return send([]);
    if (pathname.includes("/payroll")) return send([]);
    if (pathname.includes("/performance")) return send([]);
    return send([]);
  }

  // --- 3. Reports & Analytics ---
  if (pathname === "/api/v1/reports" || pathname === "/reports") {
    return send([
      { key: "sales-daily", title: "Daily Sales Summary", group: "Sales" },
      { key: "item-sales", title: "Dish Sales & Mix", group: "Sales" },
      { key: "inventory-consumption", title: "Stock Consumption", group: "Inventory" },
    ]);
  }

  if (pathname.includes("/report-schedules")) {
    return send({ emailConfigured: true, schedules: [] });
  }

  if (pathname.startsWith("/api/v1/reports/") || pathname.startsWith("/reports/")) {
    return send({
      key: "sales-daily",
      title: "Daily Sales Summary",
      columns: ["Date", "Orders", "Gross Sales", "Net Sales"],
      rows: [
        [new Date().toISOString().slice(0, 10), 42, "₹24,580.00", "₹22,122.00"],
      ],
    });
  }

  // --- 4. Accounting & Finance ---
  if (pathname.includes("/accounting")) {
    if (pathname.includes("/branches")) {
      return send([{ id: "br-1", name: "Main Branch" }]);
    }
    if (pathname.includes("/closing/preview")) {
      return send({ totalCash: 12450, totalCard: 8900, totalUpi: 3230, expectedTotal: 24580 });
    }
    if (pathname.includes("/closing")) return send([]);
    if (pathname.includes("/gst")) {
      return send({ totalTaxable: 21066, cgst: 1053.3, sgst: 1053.3, igst: 0, totalTax: 2106.6 });
    }
    if (pathname.includes("/profit-loss")) {
      return send({ revenue: 24580, cogs: 7374, grossProfit: 17206, expenses: 5400, netProfit: 11806 });
    }
    return send([]);
  }

  // --- 5. Customers ---
  if (pathname.includes("/customers")) {
    return send([
      {
        id: "cust-1",
        name: "Rahul Sharma",
        phone: "9876543210",
        email: "rahul@example.com",
        totalOrders: 5,
        totalSpent: "3450.00",
        loyaltyPoints: 345,
        createdAt: new Date().toISOString(),
      },
      {
        id: "cust-2",
        name: "Ananya Deshmukh",
        phone: "9823456789",
        email: "ananya@example.com",
        totalOrders: 3,
        totalSpent: "1890.00",
        loyaltyPoints: 189,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  // --- 6. Delivery & Riders ---
  if (pathname.includes("/delivery")) {
    if (pathname.includes("/drivers")) {
      return send([
        { id: "drv-1", name: "Amit Kumar", phone: "9876501234", status: "AVAILABLE" },
        { id: "drv-2", name: "Suresh Patil", phone: "9876505678", status: "ON_DELIVERY" },
      ]);
    }
    if (pathname.includes("/zones")) {
      return send([
        { id: "zn-1", name: "Within 5km (Downtown)", fee: "30.00", minOrder: "200.00" },
      ]);
    }
    return send([]);
  }

  if (pathname.includes("/rider")) {
    if (pathname.includes("/me")) {
      return send({ id: "drv-1", name: "Amit Kumar", isAvailable: true });
    }
    return send([]);
  }

  // --- 7. Reservations & Waitlist ---
  if (pathname.includes("/reservations")) {
    return send([
      {
        id: "res-1",
        customerName: "Priya Patel",
        phone: "9812345678",
        partySize: 4,
        reservedAt: new Date(Date.now() + 2 * 3600000).toISOString(),
        status: "CONFIRMED",
        table: { number: "4", name: "Table 4" },
      },
    ]);
  }

  if (pathname.includes("/waitlist")) {
    return send([]);
  }

  // --- 8. Marketing & Coupons ---
  if (pathname.includes("/marketing")) {
    if (pathname.includes("/coupons")) {
      return send([
        {
          id: "cpn-1",
          code: "EASY50",
          discountType: "PERCENTAGE",
          discountValue: "50.00",
          minOrderValue: "199.00",
          isActive: true,
        },
      ]);
    }
    return send([]);
  }

  // --- 9. Operations & Documents ---
  if (pathname.includes("/operations")) {
    return send([]);
  }

  // --- 10. System, Settings, Backups, Sync ---
  if (pathname.includes("/backups")) {
    if (pathname.includes("/status")) {
      return send({ configured: false, autoBackupsEnabled: false, lastRun: null });
    }
    return send([]);
  }

  if (pathname.includes("/sync/status")) {
    return send({ status: "SYNCED", pendingCount: 0 });
  }

  if (pathname.includes("/system/update/check")) {
    return send({ updateAvailable: false });
  }

  if (pathname.includes("/auth/2fa/status")) {
    return send({ enabled: false });
  }

  if (pathname.includes("/auth/setup-status")) {
    return send({ setupComplete: true });
  }

  if (pathname.includes("/audit-logs")) {
    if (pathname.includes("/entities")) {
      return send(["Order", "MenuItem", "Table", "Staff", "Inventory"]);
    }
    return send({ data: [], total: 0 });
  }

  if (pathname.includes("/webhooks")) {
    if (pathname.includes("/events")) {
      return send(["order.created", "order.completed", "table.occupied", "inventory.low"]);
    }
    return send([]);
  }

  if (pathname.includes("/integration-hub") || pathname.includes("/integration-api-keys") || pathname.includes("/staff-api-keys")) {
    return send([]);
  }

  if (pathname.includes("/payment-gateways")) {
    return send([]);
  }

  if (pathname.includes("/roles")) {
    return send([{ id: "role-admin", name: "Administrator", permissions: ["*"] }]);
  }

  if (pathname.includes("/staff") || pathname.includes("/users")) {
    return send([
      { id: "u-admin", name: "Restaurant Owner", email: "admin@easydine.com", roleName: "ADMIN", isActive: true },
      { id: "u-cashier", name: "Lead Cashier", email: "cashier@easydine.com", roleName: "CASHIER", isActive: true },
    ]);
  }

  if (pathname.includes("/attendance")) {
    if (pathname.includes("/me")) return send(null);
    return send([]);
  }

  // If method is GET and path asks for list or collection, return array to prevent client crashes
  if (req.method === "GET") {
    return send([]);
  }

  send({ status: "ok" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`EasyDine preview API service listening on http://0.0.0.0:${PORT}`);
});
