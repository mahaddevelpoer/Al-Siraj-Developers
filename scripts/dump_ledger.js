const { readExcelFile } = require('./src/main/db/core');
const path = require('path');
const os = require('os');
async function dump() {
  const fp = path.join(os.homedir(), '.gemini/antigravity/ZameenKhata_Database/Global/Money_Ledger.xlsx');
  const rows = await readExcelFile(fp, 'Data');
  console.log(JSON.stringify(rows.map(r => ({ ...r, Source_ID: r.Source_ID })), null, 2));
}
dump();
