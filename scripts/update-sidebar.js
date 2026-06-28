const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, '../views/admin');
const files = fs.readdirSync(viewsDir).filter(f => f.endsWith('.ejs'));

const icons = {
    dashboard: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>`,
    siswa: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>`,
    guru: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>`,
    jadwal: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`,
    master: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>`,
    enrolment: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l9-5-9-5-9 5 9 5z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222"></path></svg>`,
    logout: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>`
};

const replaceSidebarIcons = (content) => {
    // 1. Replace Logo
    content = content.replace(/<div class="text-3xl font-bold text-white mb-12 mt-4 tracking-widest pl-2">PADi<\/div>/g, 
        `<div class="flex items-center gap-3 mb-12 mt-4 pl-2">
            <img src="/images/logo_padi.png" alt="Logo" class="w-10 h-10 object-contain drop-shadow-md">
            <span class="text-3xl font-black text-white tracking-widest">PADi</span>
        </div>`
    );

    // 2. Replace Icons
    content = content.replace(/<span class="text-lg">⊞<\/span>/g, icons.dashboard);
    content = content.replace(/<span class="text-lg">👤<\/span>/g, icons.siswa);
    content = content.replace(/<span class="text-lg">👨‍🏫<\/span>/g, icons.guru);
    content = content.replace(/<span class="text-lg">📅<\/span>/g, icons.jadwal);
    content = content.replace(/<span class="text-lg">🗂️<\/span>/g, icons.master);
    content = content.replace(/<span class="text-lg">🎓<\/span>/g, icons.enrolment);
    content = content.replace(/<span class="text-lg">⎋<\/span>/g, icons.logout);

    return content;
};

for (const file of files) {
    const filePath = path.join(viewsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    if (file === 'Login.ejs') {
        // Fix Login.ejs Colors
        content = content.replace(/from-blue-600 to-blue-900/g, 'from-primary to-primary-dark');
        content = content.replace(/text-blue-300/g, 'text-primary-light');
        content = content.replace(/ring-blue-400/g, 'ring-primary-light');
        content = content.replace(/text-blue-100/g, 'text-primary/20');
        
        // Fix Login.ejs Logo Left (Desktop)
        content = content.replace(
            /<div class="bg-primary p-3 rounded-2xl shadow-lg shadow-primary\/30">\s*<svg.*?>.*?<\/svg>\s*<\/div>/s,
            `<img src="/images/logo_padi.png" alt="PADi Logo" class="w-16 h-16 drop-shadow-xl">`
        );
        // Fix Login.ejs Logo Right (Mobile)
        content = content.replace(
            /<div class="bg-white p-2.5 rounded-xl shadow-lg">\s*<svg.*?>.*?<\/svg>\s*<\/div>/s,
            `<img src="/images/logo_padi.png" alt="PADi Logo" class="w-10 h-10 drop-shadow-md">`
        );
    } else {
        // Only do sidebar replacement for non-login pages
        content = replaceSidebarIcons(content);
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
}
