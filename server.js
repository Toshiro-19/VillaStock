const express = require("express");
const app = express();
const { saveGuildConfig, getGuildConfig } = require("./data/db");
const path = require("path");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Ruta para ver la configuración
app.get("/config/:guildId", async (req, res) => {
    try {
        const config = await getGuildConfig(req.params.guildId) || {};
        res.render("config", { guildId: req.params.guildId, config });
    } catch (e) {
        res.status(500).send("Error al cargar configuración: " + e.message);
    }
});

// Ruta para guardar cambios
app.post("/save-config", async (req, res) => {
    try {
        const { guildId, seedChannelId, fruitChannelId } = req.body;
        
        // Estructura que espera tu base de datos
        const configData = {
            guildId,
            seedChannelId,
            fruitChannelId,
            updatedAt: new Date()
        };

        await saveGuildConfig(guildId, configData);
        res.send("Configuración guardada correctamente. Puedes cerrar esta ventana.");
    } catch (e) {
        res.status(500).send("Error al guardar: " + e.message);
    }
});

// Inicio seguro del servidor
const PORT = 3000;
const server = app.listen(PORT, () => {
    console.log(`Dashboard activo en http://localhost:${PORT}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log("El puerto 3000 ya está en uso, omitiendo inicio del servidor web...");
    }
});

module.exports = app;