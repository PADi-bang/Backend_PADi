const express = require('express');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');
require('dotenv').config();

const app = express();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

app.use(cors());
app.use(express.json());

// Endpoint CRUD: Get All Items
app.get('/items', async (req, res) => {
    try {
        const items = await prisma.item.findMany();
        res.json(items);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Endpoint CRUD: Create Item
app.post('/items', async (req, res) => {
    const { name, description } = req.body;
    try {
        const newItem = await prisma.item.create({
            data: {
                name,
                description
            }
        });
        res.json(newItem);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.listen(3000, () => console.log('Server running on port 3000'));
