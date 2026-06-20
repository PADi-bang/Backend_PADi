const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Starting migration...");

    // 1. Create Tingkat records
    const tingkatNames = ["X", "XI", "XII"];
    for (const name of tingkatNames) {
        const existing = await prisma.masterTingkat.findFirst({ where: { namaTingkat: name } });
        if (!existing) {
            await prisma.masterTingkat.create({ data: { namaTingkat: name } });
            console.log(`Created Tingkat: ${name}`);
        }
    }

    const tingkats = await prisma.masterTingkat.findMany();
    const tingkatMap = {};
    tingkats.forEach(t => { tingkatMap[t.namaTingkat] = t.id; });

    // 2. Migrate MasterKelas records
    const kelasList = await prisma.masterKelas.findMany();
    for (const k of kelasList) {
        if (!k.tingkatId) {
            const parts = k.namaKelas.split(' ');
            const prefix = parts[0].toUpperCase();
            let tingkatId = null;

            // Check if prefix matches "X", "XI", "XII"
            if (tingkatMap[prefix]) {
                tingkatId = tingkatMap[prefix];
                const newName = parts.slice(1).join(' ').trim();
                
                await prisma.masterKelas.update({
                    where: { id: k.id },
                    data: { 
                        tingkatId: tingkatId,
                        namaKelas: newName || '-' 
                    }
                });
                console.log(`Updated Kelas ID ${k.id}: '${k.namaKelas}' -> tingkatId: ${tingkatId}, namaKelas: '${newName}'`);
            } else {
                // If the class name doesn't start with X, XI, XII, default to X for now or leave it
                console.log(`Warning: Kelas ID ${k.id} ('${k.namaKelas}') prefix not found in map.`);
                // We'll set it to 'X' by default if no matching prefix
                await prisma.masterKelas.update({
                    where: { id: k.id },
                    data: { 
                        tingkatId: tingkatMap["X"],
                        // leave namaKelas as is since it doesn't match standard format
                    }
                });
            }
        }
    }
    console.log("Migration completed.");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
