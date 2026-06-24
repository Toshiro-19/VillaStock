require("dotenv").config();
const { Client, GatewayIntentBits, AttachmentBuilder } = require("discord.js");
const axios = require("axios");
const cron = require("node-cron");
const sharp = require("sharp");
const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;

// ==========================================
// 0. CONFIGURACIÓN GLOBAL Y LOGS
// ==========================================
function log(msg) {
    const time = new Date().toLocaleTimeString("es-CO", { timeZone: "America/Bogota" });
    console.log(`[${time}] ${msg}`);
}

const AXIOS_CONFIG = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    }
};

const SPECIAL_FRUIT_ROLES = {
    "Kitsune": "1519056519369593035",
    "Leopard": "1519056702668935278",
    "Yeti": "1519056663078768701",
    "Gravedad": "1519056859435372565",
    "Gravity": "1519056859435372565",
    "Spirit": "1519056905241366619",
    "T-Rex": "1519057039404302596",
    "Mammoth": "1519057134149566625",
    "Dough": "1519057193628991670",
    "Venom": "1519057262671302866",
    "Control": "1519057327737540840",
    "Shadow": "1519057451729682564",
    "Dragon": "1519057529995399339",
    "Portal": "1519059370657185882",
    "Rumble": "1519059913123303585",
    "Blizzard": "1519059911848231063",
    "Phoenix": "1519060205097193796",
    "Pain": "1519059395256778855",
    "Buddha": "1519070964690714736"
};

// ==========================================
// 1. INICIALIZACIÓN Y BASE DE DATOS
// ==========================================
const app = express();
app.set('trust proxy', 1);

const dbPath = path.join(__dirname, 'db.json');

function readDb() {
    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, JSON.stringify({}));
        return {};
    }
    const data = fs.readFileSync(dbPath, 'utf8');
    try {
        if (!data || data.trim() === "") throw new Error("Vacío");
        return JSON.parse(data);
    } catch (e) {
        fs.writeFileSync(dbPath, JSON.stringify({}));
        return {};
    }
}

function writeDb(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ==========================================
// 2. AUTENTICACIÓN CON DISCORD 
// ==========================================
app.use(session({
    store: new FileStore({ path: path.join(__dirname, 'sessions'), logFn: function() {} }),
    secret: process.env.SESSION_SECRET || 'villa_stock_secret_key_123',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 86400000 * 7 } 
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    // 🌟 AJUSTE NUBE: Usamos variable de entorno para la URL de retorno
    callbackURL: process.env.CALLBACK_URL || 'http://localhost:3000/dashboard', 
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

function checkAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.send(`
        <body style="background:#1e1f22; color:white; font-family:sans-serif; text-align:center; padding-top:100px;">
            <h2>Acceso Restringido</h2>
            <p style="color:#b5bac1;">Debes iniciar sesión con Discord para configurar tu servidor en VillaStock.</p>
            <a href="/login" style="display:inline-block; padding:10px 20px; background:#5865F2; color:white; text-decoration:none; border-radius:5px; margin-top:20px; font-weight:bold;">Iniciar Sesión con Discord</a>
        </body>
    `);
}

// ==========================================
// 3. RUTAS WEB Y DASHBOARD
// ==========================================
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => res.redirect('/dashboard'));
app.get('/login', passport.authenticate('discord'));

app.get('/dashboard', (req, res, next) => {
    if (req.isAuthenticated()) return renderDashboard(req, res);
    if (req.query.code) {
        return passport.authenticate('discord', (err, user, info) => {
            if (err) return res.send(`<h2>Error</h2><p>${err.message}</p>`);
            if (!user) return res.redirect('/');
            req.logIn(user, (loginErr) => {
                if (loginErr) return next(loginErr);
                return res.redirect('/dashboard');
            });
        })(req, res, next);
    }
    return checkAuth(req, res, next);
});

function renderDashboard(req, res) {
    const adminGuilds = req.user.guilds.filter(g => (g.permissions & 8) === 8);
    let html = `
        <body style="background:#1e1f22; color:#dbdee1; font-family:'gg sans', sans-serif; display:flex; justify-content:center; padding: 40px;">
            <div style="width:100%; max-width:600px; background:#313338; padding:24px; border-radius:8px; box-shadow: 0 8px 16px rgba(0,0,0,0.2);">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid #3f4147; padding-bottom: 12px; margin-bottom: 20px;">
                    <h2 style="margin:0; color:#f2f3f5; font-size:20px;">Tus Servidores</h2>
                    <a href="/logout" style="color:#fa777c; text-decoration:none; font-size:14px; font-weight:600;">Cerrar Sesión</a>
                </div>
                <div style="display:flex; flex-direction:column; gap:12px;">
    `;
    
    if (adminGuilds.length === 0) {
        html += `<p style="text-align:center; color:#fa777c;">No eres administrador en ningún servidor.</p>`;
    } else {
        adminGuilds.forEach(g => {
            const hasBot = client.guilds.cache.has(g.id); 
            if (hasBot) {
                html += `
                <div style="padding:15px; background:#2b2d31; border-radius:6px; border:1px solid #3f4147; display:flex; align-items:center; justify-content:space-between;">
                    <span style="color:#f2f3f5; font-weight:500;">🟢 <strong>${g.name}</strong></span>
                    <a href="/config/${g.id}" style="padding:6px 14px; background:#248046; color:white; text-decoration:none; border-radius:4px; font-weight:600; font-size:13px;">⚙️ Configurar</a>
                </div>`;
            } else {
                const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=8&scope=bot&guild_id=${g.id}&disable_guild_select=true`;
                html += `
                <div style="padding:15px; background:#2b2d31; border-radius:6px; border:1px solid #1e1f22; display:flex; align-items:center; justify-content:space-between; opacity:0.8;">
                    <span style="color:#b5bac1; font-weight:500;">⚪ ${g.name}</span>
                    <a href="${inviteUrl}" target="_blank" style="padding:6px 14px; background:#5865F2; color:white; text-decoration:none; border-radius:4px; font-weight:600; font-size:13px;">➕ Invitar Bot</a>
                </div>`;
            }
        });
    }

    html += `</div></div></body>`;
    res.send(html);
}

app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

app.get("/config/:guildId", checkAuth, async (req, res) => {
    const guildId = req.params.guildId;
    const userGuild = req.user.guilds.find(g => g.id === guildId && (g.permissions & 8) === 8);
    if (!userGuild) return res.status(403).send("Acceso Denegado");

    const db = readDb();
    const config = db[guildId] || { seedChannelId: "", fruitChannelId: "", roleMap: {} };
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.redirect('/dashboard');

    const channels = guild.channels.cache.filter(c => c.type === 0);
    const roles = guild.roles.cache.filter(r => r.name !== "@everyone");

    const channelOptionsSeed = channels.map(c => `<option value="${c.id}" ${config.seedChannelId === c.id ? 'selected' : ''}># ${c.name}</option>`).join("");
    const channelOptionsFruit = channels.map(c => `<option value="${c.id}" ${config.fruitChannelId === c.id ? 'selected' : ''}># ${c.name}</option>`).join("");

    const items = [
        "Tomato", "Apple", "Bamboo", "Corn", "Cactus", "Pineapple", "Mushroom", 
        "Green Bean", "Banana", "Grape", "Coconut", "Mango", "Dragon Fruit", 
        "Acorn", "Cherry", "Sunflower", "Venus Fly Trap", "Pomegranate", 
        "Moon Bloom", "Poison Apple", "Dragon's Breath", "Normal", "Mirage",
        "Kitsune", "Leopard", "Yeti", "Gravedad", "Gravity", "Spirit", "T-Rex", 
        "Mammoth", "Dough", "Venom", "Control", "Shadow", "Portal", "Rumble", 
        "Blizzard", "Phoenix", "Pain", "Buddha"
    ];

    let rolesHTML = "";
    items.forEach(item => {
        const currentRoleId = config.roleMap ? config.roleMap[item] : "";
        const roleOptions = roles.map(r => `<option value="${r.id}" ${currentRoleId === r.id ? 'selected' : ''}>@${r.name}</option>`).join("");
        rolesHTML += `
            <div class="role-card">
                <label>${item.toUpperCase()}</label>
                <select name="role_${item}" class="select2-role">
                    <option value="">-- Sin rol --</option>
                    ${roleOptions}
                </select>
            </div>
        `;
    });

    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Configuración - ${guild.name}</title>
            <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
            <link href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css" rel="stylesheet" />
            <script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>
            <style>
                body { background:#1e1f22; color:#dbdee1; font-family:'gg sans', sans-serif; display:flex; justify-content:center; padding: 20px; font-size: 14px; margin: 0; }
                .container { width:100%; max-width:800px; background:#313338; padding:24px; border-radius:8px; box-shadow: 0 8px 16px rgba(0,0,0,0.24); }
                h2 { margin-top:0; color:#f2f3f5; font-size: 20px; border-bottom: 1px solid #3f4147; padding-bottom: 12px; margin-bottom: 20px; display:flex; justify-content:space-between; align-items:center; }
                .section-title { font-weight: 700; color: #f2f3f5; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; }
                .input-group { margin-bottom: 20px; }
                .roles-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; background: #2b2d31; padding: 16px; border-radius: 8px; border: 1px solid #1e1f22; max-height: 400px; overflow-y: auto; }
                .role-card { display: flex; flex-direction: column; gap: 6px; }
                .role-card label { font-size: 11px; font-weight: 700; color: #b5bac1; }
                .btn-save { width:100%; margin-top:20px; padding:10px; background:#5865F2; color:white; font-size:14px; font-weight:600; border:none; border-radius:4px; cursor:pointer; }
                .btn-back { font-size: 14px; padding: 6px 12px; background: #4f545c; color: white; border-radius: 4px; text-decoration: none; }
                .select2-container--default .select2-selection--single { background-color: #1e1f22; border: 1px solid #1e1f22; border-radius: 4px; height: 36px; display: flex; align-items: center; }
                .select2-container--default .select2-selection--single .select2-selection__rendered { color: #dbdee1; font-size: 13px; }
                .select2-dropdown { background-color: #2b2d31; border: 1px solid #1e1f22; }
                .select2-search--dropdown .select2-search__field { background-color: #1e1f22; border: none; color: white; padding: 6px 8px; }
                .select2-results__option--highlighted[aria-selected] { background-color: #404249; color: white; }
                ::-webkit-scrollbar { width: 8px; }
                ::-webkit-scrollbar-track { background: #2b2d31; }
                ::-webkit-scrollbar-thumb { background: #1a1b1e; border-radius: 4px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>
                    <span>⚙️ Panel - ${guild.name}</span>
                    <a href="/dashboard" class="btn-back">Volver al Dashboard</a>
                </h2>
                <form action="/save" method="POST">
                    <input type="hidden" name="guildId" value="${guildId}">
                    <div class="input-group">
                        <div class="section-title">Canal de Semillas</div>
                        <select name="seedChannelId" class="select2-channel" style="width:100%;">
                            <option value="">-- Selecciona un canal --</option>
                            ${channelOptionsSeed}
                        </select>
                    </div>
                    <div class="input-group">
                        <div class="section-title">Canal de Frutas</div>
                        <select name="fruitChannelId" class="select2-channel" style="width:100%;">
                            <option value="">-- Selecciona un canal --</option>
                            ${channelOptionsFruit}
                        </select>
                    </div>
                    <div class="section-title">Etiquetas de Roles por Producto</div>
                    <div class="roles-grid">
                        ${rolesHTML}
                    </div>
                    <button type="submit" class="btn-save">Guardar Configuración</button>
                </form>
            </div>
           <script>
                $(document).ready(function() {
                    $('.select2-channel').select2();
                    $('.select2-role').select2({ placeholder: "-- Sin rol --", allowClear: true });
                    $(document).on('select2:open', () => { document.querySelector('.select2-search__field').focus(); });
                });
            </script>
        </body>
        </html>
    `);
});

app.post("/save", checkAuth, (req, res) => {
    const body = req.body;
    const guildId = body.guildId;

    const userGuild = req.user.guilds.find(g => g.id === guildId && (g.permissions & 8) === 8);
    if (!userGuild) return res.status(403).send("No autorizado.");

    const db = readDb();
    const roleMap = {};
    for (const key in body) {
        if (key.startsWith("role_") && body[key] !== "") {
            roleMap[key.replace("role_", "")] = body[key];
        }
    }

    db[guildId] = { seedChannelId: body.seedChannelId, fruitChannelId: body.fruitChannelId, roleMap: roleMap };
    writeDb(db);

    res.send(`
        <body style="background:#1e1f22; color:white; font-family:sans-serif; text-align:center; padding:50px;">
            <h2 style="color:#57F287;">¡Guardado con éxito!</h2>
            <script>setTimeout(()=>window.location.href = '/config/${guildId}', 1200)</script>
        </body>
    `);
});

// 🌟 AJUSTE NUBE: Render inyecta su propio puerto dinámicamente aquí
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    log(`🌐 Servidor web activo en puerto: ${PORT}`);
});

// ==========================================
// 4. LÓGICA DE SCRAPING, GRUPOS E IMÁGENES MEJORADAS
// ==========================================
const lastSeedHashes = {}; 
const lastFruitHashes = {}; 
const cache = new Map();

function slugify(name) {
    return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "-");
}

async function loadImage(url, key) {
    if (cache.has(key)) return cache.get(key);
    try {
        const r = await axios.get(url, AXIOS_CONFIG, { responseType: "arraybuffer" });
        const img = `data:image/png;base64,${(await sharp(r.data).png().toBuffer()).toString("base64")}`;
        cache.set(key, img);
        return img;
    } catch { return null; }
}

async function generateCard(title, color, items, type) {
    const rowH = 100;
    let height = 150 + (items.length * rowH) + 40; 
    
    if (type === "fruit") {
        const categories = new Set(items.map(i => i.stockType || "Normal"));
        height += (categories.size * 60); 
    }

    let rows = "";
    let yOffset = 120;
    let currentCategory = "";

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        if (type === "fruit" && item.stockType !== currentCategory) {
            currentCategory = item.stockType || "Normal";
            const catColor = currentCategory === 'Mirage' ? '#c084fc' : '#4ade80'; 
            const catTitle = currentCategory === 'Mirage' ? '✨ MIRAGE STOCK' : '🌟 NORMAL STOCK';
            
            rows += `<text x="50" y="${yOffset + 40}" fill="${catColor}" font-family="Arial" font-size="28" font-weight="bold">${catTitle}</text>`;
            yOffset += 60; 
        }

        const y = yOffset;
        let imgUrl = type === "seed" ? `https://gag.gg/seeds/${slugify(item.name)}.png` : `https://fruityblox.com/images/fruits/${slugify(item.name)}.webp`;
        let img = await loadImage(imgUrl, `${type}_${item.name}`);

        const isSpecial = SPECIAL_FRUIT_ROLES[item.name] !== undefined;
        const boxFill = isSpecial ? "#3b2f15" : "#2F3136"; 
        const boxStroke = isSpecial ? `stroke="#eab308" stroke-width="2"` : "";
        const textColor = isSpecial ? "#eab308" : "white"; 

        rows += `
        <g>
            <rect x="20" y="${y}" width="960" height="80" rx="15" fill="${boxFill}" ${boxStroke}/>
            ${img ? `<image href="${img}" x="40" y="${y+10}" width="60" height="60"/>` : ""}
            <text x="${img ? 120 : 50}" y="${y+55}" fill="${textColor}" font-family="Arial" font-size="28" font-weight="bold">${item.prefix || ""} ${item.name}</text>
            <text x="940" y="${y+55}" text-anchor="end" fill="${item.stockType === 'Mirage' ? '#c084fc' : '#4ade80'}" font-family="Arial" font-size="20" font-weight="bold">${item.stockType ? item.stockType.toUpperCase() : ""}</text>
        </g>`;
        
        yOffset += rowH;
    }

    const timestamp = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });
    rows += `<text x="50" y="${height - 20}" fill="#80848e" font-family="Arial" font-size="16">Última actualización: ${timestamp}</text>`;

    const svg = `
    <svg width="1000" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#202225" rx="20"/>
        <rect width="100%" height="10" fill="${color}"/>
        <text x="50" y="70" fill="white" font-family="Arial" font-size="40" font-weight="bold">${title}</text>
        ${rows}
    </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
}

async function sendStock(channelId, buffer, filename, roleMap, items) {
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const matchedRoleIds = [];

    items.forEach(i => {
        if (i.suffix && roleMap[i.suffix.replace(/[\[\]]/g, '')]) matchedRoleIds.push(roleMap[i.suffix.replace(/[\[\]]/g, '')]); 
        if (roleMap[i.name]) matchedRoleIds.push(roleMap[i.name]);
        if (SPECIAL_FRUIT_ROLES[i.name]) matchedRoleIds.push(SPECIAL_FRUIT_ROLES[i.name]);
    });

    const mentions = [...new Set(matchedRoleIds)].map(id => `<@&${id}>`).join(" ");
    
    await channel.send({
        content: mentions || "¡Nuevo Stock Disponible!",
        files: [new AttachmentBuilder(buffer, { name: filename })]
    });
}

// --- Procesadores de Grupos con Manejo de Errores ---
async function checkSeeds(config, guildId, seeds) {
    if (!config || !config.seedChannelId || seeds.length === 0) return;
    try {
        const hash = crypto.createHash("md5").update(JSON.stringify(seeds)).digest("hex");
        if (lastSeedHashes[guildId] === hash) return;

        const card = await generateCard("🌱 Semillas en Stock", "#f1a524", seeds.map(s => ({ prefix: `${s.lastQty || 1}x`, name: s.name })), "seed");
        await sendStock(config.seedChannelId, card, "seeds.png", config.roleMap, seeds);
        
        lastSeedHashes[guildId] = hash;
        log(`✅ Semillas enviadas al servidor: ${guildId}`);
    } catch (e) { log(`❌ Error Semillas Guild ${guildId}: ${e.message}`); }
}

async function checkFruits(config, guildId, allFruits) {
    if (!config || !config.fruitChannelId || allFruits.length === 0) return;
    try {
        const hash = crypto.createHash("md5").update(JSON.stringify(allFruits)).digest("hex");
        if (lastFruitHashes[guildId] === hash) return;

        const card = await generateCard("🍎 Frutas en Stock", "#ff4757", allFruits, "fruit");
        await sendStock(config.fruitChannelId, card, "fruits.png", config.roleMap, allFruits);
        
        lastFruitHashes[guildId] = hash;
        log(`✅ Frutas enviadas al servidor: ${guildId}`);
    } catch (e) { log(`❌ Error Frutas Guild ${guildId}: ${e.message}`); }
}

async function monitor() {
    const db = readDb();
    const guildIds = Object.keys(db);
    if (guildIds.length === 0) return;

    let globalSeeds = [];
    let globalFruits = [];

    try {
        const r = await axios.get("https://gag.gg/api/seed-restock", AXIOS_CONFIG);
        globalSeeds = (r.data.seeds || []).filter(x => x.inStockNow || x.stock > 0);
    } catch (e) { 
        log(`⚠️ Error de conexión global Semillas: ${e.message}`); 
    }

    try {
        const { data } = await axios.get("https://fruityblox.com/stock", AXIOS_CONFIG);
        const $ = cheerio.load(data);
        
        let currentStockType = "Normal";
        
        $('*').each((i, el) => {
            const tagName = el.tagName.toLowerCase();
            
            if (tagName === 'a') {
                const href = $(el).attr('href') || "";
                if (href.includes('/items/')) {
                    const name = $(el).find('h3').text().trim();
                    if (name && !globalFruits.find(f => f.name === name && f.stockType === currentStockType)) {
                        globalFruits.push({ name: name, suffix: "", stockType: currentStockType });
                    }
                }
            } else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'p', 'span'].includes(tagName)) {
                const text = $(el).clone().children().remove().end().text().trim().toLowerCase();
                if (text.includes("mirage")) {
                    currentStockType = "Mirage";
                } else if (text === "normal stock" || text === "current stock" || text === "regular stock" || text === "normal" || text.includes("normal")) {
                    currentStockType = "Normal";
                }
            }
        });

        globalFruits.sort((a, b) => {
            if (a.stockType === b.stockType) return 0;
            return a.stockType === "Normal" ? -1 : 1;
        });

    } catch (e) { 
        log(`⚠️ Error de conexión global Frutas: ${e.message}`); 
    }

    if (globalSeeds.length === 0 && globalFruits.length === 0) {
        log("🛡️ Las webs devolvieron 0 items. Abortando actualización para prevenir limpieza de stock.");
        return;
    }

    for (const guildId of guildIds) {
        const config = db[guildId];
        if (globalSeeds.length > 0) await checkSeeds(config, guildId, globalSeeds);
        if (globalFruits.length > 0) await checkFruits(config, guildId, globalFruits);
    }
}

// ==========================================
// 5. INICIO DEL BOT
// ==========================================
client.once("ready", () => {
    log(`🤖 Bot listo como: ${client.user.tag}`);
    monitor(); 
    cron.schedule("*/5 * * * *", monitor); 
});

client.login(process.env.BOT_TOKEN);