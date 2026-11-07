const fs = require('fs');

// 1. add-item-dialog.tsx
const addFile = 'C:\\Users\\ASUS\\.gemini\\antigravity\\scratch\\easy-dine-pos\\apps\\web\\components\\menu\\add-item-dialog.tsx';
let addContent = fs.readFileSync(addFile, 'utf8');
addContent = addContent.replace('settings?.branch.taxMode', 'settings?.branch?.taxMode');
fs.writeFileSync(addFile, addContent, 'utf8');
console.log('Fixed add-item-dialog.tsx optional chaining');

// 2. edit-item-dialog.tsx
const editFile = 'C:\\Users\\ASUS\\.gemini\\antigravity\\scratch\\easy-dine-pos\\apps\\web\\components\\menu\\edit-item-dialog.tsx';
let editContent = fs.readFileSync(editFile, 'utf8');
editContent = editContent.replace('settings?.branch.taxMode', 'settings?.branch?.taxMode');
fs.writeFileSync(editFile, editContent, 'utf8');
console.log('Fixed edit-item-dialog.tsx optional chaining');
