const fs = require('fs');
const file = 'C:\\Users\\ASUS\\.gemini\\antigravity\\scratch\\easy-dine-pos\\packages\\types\\src\\permissions.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  'if (held.includes(required)) return true;',
  'if (held.includes("*") || held.includes(required)) return true;'
);
fs.writeFileSync(file, content, 'utf8');
console.log('Updated permissions.ts successfully');
