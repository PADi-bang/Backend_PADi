const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, '../views/admin');
const files = fs.readdirSync(viewsDir).filter(f => f.endsWith('.ejs'));

for (const file of files) {
    const filePath = path.join(viewsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // For any `<div class="... overflow-hidden">` that immediately precedes a `<table`, replace overflow-hidden with overflow-x-auto
    content = content.replace(/<div class="([^"]*)overflow-hidden([^"]*)">\s*<table/g, '<div class="$1overflow-x-auto$2">\s*<table');
    
    // For master_data, if it's still missing:
    // It's already in an overflow-y-auto, we just added overflow-x-auto to it in the previous script.
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated tables in ${file}`);
}
