const fs = require('fs');

const file = 'C:\\Users\\ASUS\\.gemini\\antigravity\\scratch\\easy-dine-pos\\apps\\web\\hooks\\use-backups.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'query.state.data?.some((b) => b.status === "PENDING")',
  'Array.isArray(query.state.data) && query.state.data.some((b) => b.status === "PENDING")'
);

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed use-backups.ts refetchInterval check');
