require("dotenv").config();

const express = require("express");
const cors = require("cors");
const pool = require("./db/database");
const comprasProveedoresRoutes = require("./routes/comprasProveedores.routes");

const app = express();

app.use(cors());
app.use(express.json());

// Crea automáticamente las tablas de la HU-28 y proveedores de prueba al iniciar el servidor
const inicializarTablas = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS proveedores (
                id_proveedor SERIAL PRIMARY KEY,
                nombre VARCHAR(120) NOT NULL,
                cuit VARCHAR(20) UNIQUE,
                telefono VARCHAR(30),
                email VARCHAR(120),
                activo BOOLEAN DEFAULT TRUE
            );

            CREATE TABLE IF NOT EXISTS compras_proveedores (
                id_compra_proveedor SERIAL PRIMARY KEY,
                id_proveedor INTEGER NOT NULL REFERENCES proveedores(id_proveedor),
                numero_comprobante VARCHAR(50) NOT NULL,
                fecha_compra DATE NOT NULL DEFAULT CURRENT_DATE,
                monto_total NUMERIC(12, 2) NOT NULL CHECK (monto_total >= 0),
                observaciones TEXT,
                estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_DETALLE',
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            INSERT INTO proveedores (nombre, cuit, telefono, email)
            VALUES 
                ('Distribuidora Andina Outdoor S.A.', '30-71234567-9', '3442-451122', 'ventas@andinaoutdoor.com.ar'),
                ('Importadora Patagonia Camping SRL', '30-70987654-3', '11-5234-9988', 'contacto@patagoniacamping.com'),
                ('Textil Montaña Argentina', '30-68451230-1', '351-4892211', 'pedidos@textilmontana.com.ar')
            ON CONFLICT (cuit) DO NOTHING;
        `);
        console.log("Tablas de proveedores y compras listas en PostgreSQL");
    } catch (error) {
        console.error("Error al inicializar las tablas:", error);
    }
};

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

// Rutas de Aventura 360 (HU-28)
app.use("/api", comprasProveedoresRoutes);

const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
    console.log(`Servidor ejecutándose en puerto ${PORT}`);
    await inicializarTablas();
});