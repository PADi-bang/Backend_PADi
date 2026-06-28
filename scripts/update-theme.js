const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, 'backend/views/admin');
const files = fs.readdirSync(viewsDir).filter(f => f.endsWith('.ejs'));

const tailwindConfig = `
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        primary: '#006D5B',
                        'primary-dark': '#004A3F',
                        'primary-light': '#338A7B',
                    },
                    fontFamily: {
                        sans: ['Outfit', 'sans-serif'],
                    }
                }
            }
        }
    </script>
</head>`;

for (const file of files) {
    const filePath = path.join(viewsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Inject tailwind config & fonts before </head>
    if (content.includes('</head>') && !content.includes('tailwind.config')) {
        content = content.replace('</head>', tailwindConfig);
    }

    // 2. Replace colors
    // bg-blue-600 -> bg-primary
    // text-blue-600 -> text-primary
    // border-blue-500 -> border-primary
    // shadow-blue-600/X -> shadow-primary/X
    // bg-blue-700 -> bg-primary-dark
    // hover:bg-blue-700 -> hover:bg-primary-dark
    // bg-blue-50 -> bg-primary/10
    // text-blue-500 -> text-primary
    // text-blue-200 -> text-white/70
    // text-blue-400 -> text-primary-light
    // border-blue-400 -> border-primary-light
    // border-blue-100 -> border-primary/20
    
    content = content.replace(/bg-blue-600/g, 'bg-primary');
    content = content.replace(/text-blue-600/g, 'text-primary');
    content = content.replace(/border-blue-600/g, 'border-primary');
    content = content.replace(/shadow-blue-600/g, 'shadow-primary');
    
    content = content.replace(/bg-blue-700/g, 'bg-primary-dark');
    content = content.replace(/text-blue-700/g, 'text-primary-dark');
    
    content = content.replace(/bg-blue-500/g, 'bg-primary-light');
    content = content.replace(/text-blue-500/g, 'text-primary-light');
    content = content.replace(/border-blue-500/g, 'border-primary-light');
    
    content = content.replace(/text-blue-200/g, 'text-white/70');
    content = content.replace(/text-blue-400/g, 'text-primary-light');
    content = content.replace(/border-blue-400/g, 'border-primary-light');
    
    content = content.replace(/bg-blue-50/g, 'bg-primary/10');
    content = content.replace(/border-blue-100/g, 'border-primary/20');
    content = content.replace(/bg-blue-200/g, 'bg-primary/30');
    
    content = content.replace(/bg-blue-100/g, 'bg-primary/20');

    // 3. Change sidebar background from bg-black to bg-[#00382E] (Dark green)
    content = content.replace(/bg-black text-gray-400/g, 'bg-[#00382E] text-white/70');

    // 4. In ApexCharts (if exists), replace '#2563eb' (blue) with '#006D5B'
    content = content.replace(/'#2563eb'/g, "'#006D5B'");
    // Donut chart colors: ['#2563eb', '#000000', '#94a3b8']
    // Let's replace the #000000 (Izin) with yellow/orange, and #94a3b8 with gray
    content = content.replace(/\['#006D5B', '#000000', '#94a3b8'\]/g, "['#006D5B', '#F59E0B', '#EF4444']");

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
}
