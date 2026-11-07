const fs = require('fs');
const file = 'C:\\Users\\ASUS\\.gemini\\antigravity\\scratch\\easy-dine-pos\\scripts\\preview-server.js';
let content = fs.readFileSync(file, 'utf8');

const allPerms = `permissions: [
    "*",
    "sales.view", "dashboard.sales.view", "orders.create", "orders.edit", "orders.cancel", "orders.accept",
    "discounts.apply", "discounts.unlimited", "refunds.process", "orders.delete", "bills.print",
    "tables.view", "tables.manage", "menu.view", "menu.manage", "inventory.manage", "reports.access",
    "users.manage", "reports.financial.view", "data.export", "kds.manage", "reservations.manage",
    "settings.manage", "customers.manage", "audit_log.view", "roles.manage", "backup.manage",
    "attendance.manage", "delivery.manage", "delivery.rider", "staff.manage", "accounting.manage",
    "marketing.manage", "operations.manage", "system.update"
  ],`;

content = content.replace('permissions: ["*"],', allPerms);
fs.writeFileSync(file, content, 'utf8');
console.log('Updated preview-server.js permissions');
