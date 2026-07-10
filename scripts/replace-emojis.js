const fs = require('fs');
const path = require('path');

// Extract emojis from Icons.jsx
const iconsCode = fs.readFileSync(path.join(__dirname, '../src/renderer/components/Icons.jsx'), 'utf8');
const iconMapMatch = iconsCode.match(/const ICON_MAP = {([^}]+)}/s);
const emojis = [];
if (iconMapMatch) {
  const lines = iconMapMatch[1].split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*['"](.+?)['"]:/);
    if (match) emojis.push(match[1]);
  }
}

console.log('Emojis to replace:', emojis.join(' '));

const componentsDir = path.join(__dirname, '../src/renderer/components');

function replaceEmojisInJSX() {
  const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.jsx') && f !== 'Icons.jsx');
  let changedFilesCount = 0;

  files.forEach(file => {
    const filePath = path.join(componentsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    // We want to replace these emojis in text nodes.
    // To do this simply, we'll replace the raw emoji character with <Emoji emoji="X" />
    // ONLY if it's NOT inside quotes (a basic heuristic)
    // Actually, a simpler way is just replacing it everywhere except in imports/exports.
    
    // Instead of regex hacking, let's just do a string replace for common patterns.
    // Often it is: " 🚀 " or ">🚀" or "> 🚀" or "🚀 "
    
    for (const emoji of emojis) {
      if (content.includes(emoji)) {
        // Find instances of emoji not inside an <Emoji emoji="X" /> tag itself!
        // We'll use a regex to replace the emoji if it's not preceded by emoji="
        const regex = new RegExp(`(?<!emoji=["'])${emoji}`, 'g');
        content = content.replace(regex, `<Emoji emoji="${emoji}" />`);
      }
    }

    if (content !== originalContent) {
      if (!content.includes("import { Emoji }") && !content.includes("import {Emoji}")) {
        if (content.includes("from './Icons'")) {
          content = content.replace(/import\s+{([^}]*)}\s+from\s+['"]\.\/Icons['"]/, (match, imports) => {
            if (imports.includes('Emoji')) return match;
            return `import { ${imports}, Emoji } from './Icons'`;
          });
        } else {
          content = `import { Emoji } from './Icons';\n` + content;
        }
      }
      fs.writeFileSync(filePath, content, 'utf8');
      changedFilesCount++;
      console.log(`Updated ${file}`);
    }
  });

  console.log(`Total files updated: ${changedFilesCount}`);
}

replaceEmojisInJSX();
