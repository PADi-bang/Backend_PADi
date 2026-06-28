const http = require('http');
const prisma = require('../src/db');
const bcrypt = require('bcryptjs');

const baseUrl = 'http://localhost:3000';

function request(method, path, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(baseUrl + path);
        const options = {
            method,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers: {
                ...headers,
            },
        };

        if (data) {
            const body = JSON.stringify(data);
            options.headers['Content-Type'] = 'application/json';
            options.headers['Content-Length'] = Buffer.byteLength(body);
        }

        const req = http.request(options, (res) => {
            let resBody = '';
            res.on('data', chunk => { resBody += chunk; });
            res.on('end', () => {
                let parsed;
                try {
                    parsed = JSON.parse(resBody);
                } catch(e) {
                    parsed = resBody;
                }
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: parsed
                });
            });
        });

        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

async function runTests() {
    console.log('--- Memulai Pengujian (E2E) ---');
    let hasError = false;

    // 1. Dapatkan pengguna dari database untuk testing
    console.log('[1] Mencari data pengguna untuk testing...');
    const siswaUser = await prisma.user.findFirst({ where: { role: { namaRole: 'Siswa' } } });
    const guruUser = await prisma.user.findFirst({ where: { role: { namaRole: 'Guru' } } });

    if (!siswaUser || !guruUser) {
        console.error('❌ Gagal: Data siswa atau guru belum ada di database. Silakan seed database terlebih dahulu.');
        process.exit(1);
    }
    console.log(`✅ Data Pengguna Ditemukan (Siswa: ${siswaUser.username}, Guru: ${guruUser.username})`);

    // 2. Testing Login API
    console.log('\n[2] Testing Endpoint Login API...');
    
    // Karena kita tidak tahu password asli (hashed), kita bisa buat user dummy baru atau langsung generate JWT.
    // Tapi karena endpoint login butuh password, kita test endpoint register dulu lalu login, atau kita gunakan token JWT langsung.
    // Kita buat dummy register
    const testUsername = 'testsiswa_' + Date.now();
    const registerRes = await request('POST', '/api/auth/register', {
        username: testUsername,
        email: testUsername + '@test.com',
        password: 'password123',
        roleName: 'Siswa'
    });
    
    if (registerRes.status === 201) {
        console.log('✅ Endpoint Register berhasil');
    } else {
        console.error(`❌ Gagal: Endpoint Register mengembalikan status ${registerRes.status}`);
        hasError = true;
    }

    const loginRes = await request('POST', '/api/auth/login', {
        username: testUsername,
        password: 'password123'
    });

    let token = '';
    let userId = '';
    if (loginRes.status === 200 && loginRes.body.status === 'success') {
        console.log('✅ Endpoint Login berhasil');
        token = loginRes.body.token;
        userId = loginRes.body.data.id;
    } else {
        console.error(`❌ Gagal: Endpoint Login mengembalikan status ${loginRes.status}`);
        console.log(loginRes.body);
        hasError = true;
    }

    // 3. Testing Dashboard API
    if (token) {
        console.log('\n[3] Testing Endpoint Dashboard...');
        const dashboardRes = await request('GET', `/api/dashboard/${userId}`, null, { 'Authorization': `Bearer ${token}` });
        if (dashboardRes.status === 200 || dashboardRes.status === 404) { // 404 jika belum di-enrol, tidak masalah untuk API, yang penting bukan 500
             console.log(`✅ Endpoint Dashboard memberikan respons valid (Status: ${dashboardRes.status})`);
        } else {
             console.error(`❌ Gagal: Endpoint Dashboard mengembalikan status ${dashboardRes.status}`);
             console.log(dashboardRes.body);
             hasError = true;
        }

        console.log('\n[4] Testing Endpoint Perizinan (GET Pending)...');
        const izinRes = await request('GET', `/api/perizinan/pending`, null, { 'Authorization': `Bearer ${token}` });
        if (izinRes.status === 200) {
             console.log(`✅ Endpoint Perizinan (Pending) berhasil diakses (Status: ${izinRes.status})`);
        } else {
             console.error(`❌ Gagal: Endpoint Perizinan (Pending) mengembalikan status ${izinRes.status}`);
             console.log(izinRes.body);
             hasError = true;
        }
    }

    // 4. Testing Rute Halaman Web Admin (Public)
    console.log('\n[5] Testing Rendering Halaman Public Web Admin...');
    const webRes = await request('GET', '/');
    if (webRes.status === 200 || webRes.status === 302) {
        console.log(`✅ Halaman Root (/) berhasil merespon (Status: ${webRes.status})`);
    } else {
        console.error(`❌ Gagal: Halaman Root mengembalikan status ${webRes.status}`);
        hasError = true;
    }
    
    // Hapus data dummy test
    if (userId) {
        await prisma.user.delete({ where: { id: userId } });
        console.log('\n✅ Data testing telah dibersihkan');
    }

    console.log('\n--- Hasil Akhir ---');
    if (hasError) {
        console.error('❌ Terdapat error pada pengujian. Silakan periksa log di atas.');
        process.exit(1);
    } else {
        console.log('✅ Semua pengujian selesai dan berjalan dengan normal!');
        process.exit(0);
    }
}

runTests().catch(e => {
    console.error('Crash saat testing:', e);
    process.exit(1);
});
