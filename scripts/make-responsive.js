const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, '../views/admin');
const files = fs.readdirSync(viewsDir).filter(f => f.endsWith('.ejs'));

const mobileHeader = `
    <!-- Mobile Header -->
    <div class="md:hidden bg-[#00382E] text-white p-4 flex justify-between items-center fixed top-0 w-full z-30 shadow-md">
        <div class="flex items-center gap-2">
            <img src="/images/logo_padi.png" alt="Logo" class="w-8 h-8 object-contain drop-shadow-md">
            <span class="text-xl font-black tracking-widest">PADi</span>
        </div>
        <button onclick="document.getElementById('sidebar').classList.remove('-translate-x-full')" class="p-2 bg-white/10 rounded-lg focus:outline-none">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
        </button>
    </div>`;

const sidebarCloseButton = `
        <button onclick="document.getElementById('sidebar').classList.add('-translate-x-full')" class="md:hidden absolute top-6 right-4 p-2 text-white/70 hover:text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>`;

for (const file of files) {
    const filePath = path.join(viewsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Add Viewport
    if (!content.includes('name="viewport"')) {
        content = content.replace(/<meta charset="UTF-8">/, `<meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">`);
    }

    if (file !== 'Login.ejs' && file !== 'index.ejs' && file !== 'error.ejs') {
        // 2. Sidebar transformations
        // Replace fixed sidebar classes
        content = content.replace(
            /<aside class="w-64 h-screen bg-\[#00382E\] text-white\/70 p-6 flex flex-col fixed rounded-r-3xl shadow-2xl z-20">/,
            `<aside id="sidebar" class="w-64 h-screen bg-[#00382E] text-white/70 p-6 flex flex-col fixed rounded-r-3xl shadow-2xl z-40 transform -translate-x-full md:translate-x-0 transition-transform duration-300">`
        );
        
        // Inject close button in sidebar
        if (!content.includes('classList.add(\'-translate-x-full\')')) {
            content = content.replace(
                /(<div class="flex items-center gap-3 mb-12 mt-4 pl-2">[\s\S]*?<\/div>)/,
                `$1${sidebarCloseButton}`
            );
        }

        // 3. Inject Mobile Header
        if (!content.includes('<!-- Mobile Header -->')) {
            content = content.replace(/(<body[^>]*>)/, `$1\n${mobileHeader}`);
        }

        // 4. Main content transformations
        content = content.replace(
            /class="flex-1 ml-64 p-8(.*?)"/,
            `class="flex-1 md:ml-64 p-4 md:p-8 pt-24 md:pt-8 w-full transition-all duration-300$1"`
        );

        // 5. Grid layout adjustments
        // Avoid replacing already responsive grids
        if (!content.includes('grid-cols-1 md:grid-cols-2 lg:grid-cols-3')) {
            content = content.replace(/class="([^"]*)grid-cols-3/g, (match, p1) => {
                if (p1.includes('md:')) return match;
                return `class="${p1}grid-cols-1 md:grid-cols-2 lg:grid-cols-3`;
            });
        }
        
        if (!content.includes('grid-cols-1 md:grid-cols-2')) {
            content = content.replace(/class="([^"]*)grid-cols-2/g, (match, p1) => {
                if (p1.includes('md:')) return match;
                return `class="${p1}grid-cols-1 md:grid-cols-2`;
            });
        }

        // Make tables scrollable (optional but recommended for mobile)
        // Wrap tables if they aren't already in overflow-x-auto
        // A simple way is to wrap <table> in a div. 
        // For safety, let's look for common table setups or just leave them since Tailwind grids might be enough.
        // EJS files here have <table class="w-full text-left" id="..."> 
        content = content.replace(/<div class="overflow-y-auto flex-1 border rounded-xl">\s*<table/g, 
                                  `<div class="overflow-x-auto overflow-y-auto flex-1 border rounded-xl w-full">\s*<table`);
                                  
        // For enrolment detail where table is wrapped in a different div
        content = content.replace(/<div class="overflow-x-auto">\s*<table/g, `<div class="overflow-x-auto w-full">\s*<table`);
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
}
