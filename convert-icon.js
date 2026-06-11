import('png-to-ico').then(({ default: pngToIco }) => {
  const fs = require('fs');
  const path = require('path');
  pngToIco(path.join(__dirname, 'public', 'logo.png'))
    .then(buf => {
      fs.writeFileSync(path.join(__dirname, 'public', 'logo.ico'), buf);
      console.log('✅ logo.ico created successfully!');
    })
    .catch(err => {
      console.error('Conversion failed:', err.message);
    });
});
