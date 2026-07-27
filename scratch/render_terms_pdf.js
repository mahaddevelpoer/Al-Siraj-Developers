const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  try {
    const htmlPath = path.join(__dirname, '../docs/AL_SIRAJ_Terms_Conditions_Compact_Print.html');
    const pdfPath1 = 'C:\\Users\\HP\\Downloads\\Documents\\AL_SIRAJ_Terms_Conditions_Compact_Print.pdf';
    const pdfPath2 = 'C:\\Users\\HP\\Desktop\\AL_SIRAJ_Terms_Conditions_Compact_Print.pdf';
    const pdfPath3 = path.join(__dirname, '../docs/AL_SIRAJ_Terms_Conditions_Compact_Print.pdf');

    const win = new BrowserWindow({
      show: false,
      width: 1240,
      height: 1754,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    await win.loadFile(htmlPath);
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        marginType: 'custom',
        top: 0.35,
        bottom: 0.35,
        left: 0.35,
        right: 0.35,
      },
    });

    fs.writeFileSync(pdfPath1, pdf);
    fs.writeFileSync(pdfPath2, pdf);
    fs.writeFileSync(pdfPath3, pdf);
    console.log('Successfully generated PDFs at all 3 locations!');
  } catch (err) {
    console.error('Error generating PDF:', err);
  } finally {
    app.quit();
  }
});
