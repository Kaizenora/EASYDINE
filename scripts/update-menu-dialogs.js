const fs = require('fs');

// 1. EditItemDialog
const editFile = 'C:\\Users\\ASUS\\.gemini\\antigravity\\scratch\\easy-dine-pos\\apps\\web\\components\\menu\\edit-item-dialog.tsx';
let editContent = fs.readFileSync(editFile, 'utf8');

if (!editContent.includes('const [description, setDescription]')) {
  editContent = editContent.replace(
    'const [name, setName] = useState(item.name);',
    'const [name, setName] = useState(item.name);\n  const [description, setDescription] = useState(item.description ?? "");'
  );
  editContent = editContent.replace(
    /name,\s+categoryId,/,
    'name,\n          description: description.trim() || undefined,\n          categoryId,'
  );
  
  const descField = `\n          <div className="flex flex-col gap-2">
            <Label htmlFor="item-edit-desc">Description / Specifications</Label>
            <textarea
              id="item-edit-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Aromatic spices, slow-cooked gravy, portion size details"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>`;
  
  editContent = editContent.replace(
    /placeholder="e\.g\. Margherita Pizza"[\s\S]*?<\/div>/,
    (match) => match + descField
  );
  
  fs.writeFileSync(editFile, editContent, 'utf8');
  console.log('Updated edit-item-dialog.tsx');
}

// 2. AddItemDialog
const addFile = 'C:\\Users\\ASUS\\.gemini\\antigravity\\scratch\\easy-dine-pos\\apps\\web\\components\\menu\\add-item-dialog.tsx';
let addContent = fs.readFileSync(addFile, 'utf8');

if (!addContent.includes('const [description, setDescription]')) {
  addContent = addContent.replace(
    'const [name, setName] = useState("");',
    'const [name, setName] = useState("");\n  const [description, setDescription] = useState("");'
  );
  addContent = addContent.replace(
    'setName("");',
    'setName("");\n    setDescription("");'
  );
  addContent = addContent.replace(
    /name,\s+categoryId,/,
    'name,\n        description: description.trim() || undefined,\n        categoryId,'
  );
  
  const descFieldAdd = `\n          <div className="flex flex-col gap-2">
            <Label htmlFor="item-add-desc">Description / Specifications</Label>
            <textarea
              id="item-add-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Fresh ingredients, chef recommendations, portion specs"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>`;
  
  addContent = addContent.replace(
    /placeholder="e\.g\. Margherita Pizza"[\s\S]*?<\/div>/,
    (match) => match + descFieldAdd
  );

  fs.writeFileSync(addFile, addContent, 'utf8');
  console.log('Updated add-item-dialog.tsx');
}
