require("dotenv").config();

const express = require("express");
const cors = require("cors");
const defaultPool = require("./db/database");
const { crearRutasProductos } = require("./routes/productos.routes");

function crearApp(pool = defaultPool, servicioImagenes) {
    const app = express();

    app.use(cors());
    app.use(express.json());
    app.use("/api/productos", crearRutasProductos(pool, servicioImagenes));
    app.use("/api/productos", (error, req, res, next) => {
        if (error.type === "entity.parse.failed") {
            return res.status(400).json({ errores: ["El cuerpo debe ser JSON valido."] });
        }
        next(error);
    });

    // Verifica que el backend esté funcionando
    app.get("/api/health", (req, res) => {
        res.json({ status: "ok" });
    });

    // Verifica la conexión del backend con PostgreSQL
    app.get("/api/health/db", async (req, res) => {
        try {
            const result = await pool.query("SELECT NOW()");

            res.json({
                status: "ok",
                database: "connected",
                time: result.rows[0].now,
            });
        } catch (error) {
            console.error("Error al conectar con PostgreSQL:", error);

            res.status(500).json({
                status: "error",
                database: "disconnected",
            });
        }
    });

    return app;
}

module.exports = { crearApp };

if (require.main === module) {
    const app = crearApp();
    const PORT = process.env.PORT || 3001;

    app.listen(PORT, () => {
        console.log(`Servidor ejecutándose en puerto ${PORT}`);
    });
}
