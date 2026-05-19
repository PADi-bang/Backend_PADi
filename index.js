// d:\college\TI-2C\sem 4\App_PADi\backend\index.js

const app = require('./src/app'); // Impor aplikasi dari app.js
require('dotenv').config();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  console.log('Struktur aplikasi sudah dirapikan. app.js menangani logika, index.js menangani server.');
});
