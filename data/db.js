const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, '../db.json');

function readDb() {
    if (!fs.existsSync(dbPath)) return {};
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data || '{}');
}

function writeDb(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

async function getGuildConfig(guildId) {
    const db = readDb();
    return db[guildId] || null;
}

async function saveGuildConfig(guildId, config) {
    const db = readDb();
    db[guildId] = config;
    writeDb(db);
}

module.exports = { getGuildConfig, saveGuildConfig };