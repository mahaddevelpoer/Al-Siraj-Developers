const fs = require('fs');
const path = require('path');
const { getGlobalsPath, getTownsPath } = require('./src/main/db/core.js');

async function clearLocalData() {
  const globalsDir = getGlobalsPath();
  const townsDir = getTownsPath();
  
  console.log('Globals Dir:', globalsDir);
  
  // Wipe global files EXCEPT Towns.xlsx
  const keepGlobals = ['Towns.xlsx'];
  if (fs.existsSync(globalsDir)) {
    const files = fs.readdirSync(globalsDir);
    for (const file of files) {
      if (!keepGlobals.includes(file) && file.endsWith('.xlsx')) {
        fs.unlinkSync(path.join(globalsDir, file));
        console.log(`Deleted ${file}`);
      }
    }
  }

  // Wipe town-specific files EXCEPT Properties.xlsx
  // But wait, Properties.xlsx needs Status reset to Available!
  if (fs.existsSync(townsDir)) {
    const towns = fs.readdirSync(townsDir);
    for (const town of towns) {
      const townPath = path.join(townsDir, town);
      if (fs.statSync(townPath).isDirectory()) {
        const townFiles = fs.readdirSync(townPath);
        for (const file of townFiles) {
          if (file !== 'Properties.xlsx' && file.endsWith('.xlsx')) {
            fs.unlinkSync(path.join(townPath, file));
            console.log(`Deleted ${town}/${file}`);
          }
        }
      }
    }
  }
  
  console.log("Local Excel files cleared.");
}

clearLocalData().catch(console.error);
