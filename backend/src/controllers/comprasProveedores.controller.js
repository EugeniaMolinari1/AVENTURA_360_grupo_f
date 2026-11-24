const pool = require("../db/database");

// Obtener proveedores activos para el selector del formulario
const obtenerProveedores = async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT id_proveedor, nombre, cuit FROM proveedores WHERE activo = TRUE ORDER BY nombre ASC"
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Error al obtener proveedores:", error);
        res.status(500).json({ error: "Error interno al obtener los proveedores." });
    }
};

// Obtener todas las compras a proveedores registradas (disponibles para registrar su detalle)
const obtenerComprasProveedores = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                cp.id_compra_proveedor,
                cp.id_proveedor,
                p.nombre AS proveedor_nombre,
                p.cuit AS proveedor_cuit,
                cp.numero_comprobante,
                cp.fecha_compra,
                cp.monto_total,
                cp.observaciones,
                cp.estado,
                cp.creado_en
            FROM compras_proveedores cp
            INNER JOIN proveedores p ON cp.id_proveedor = p.id_proveedor
            ORDER BY cp.creado_en DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error("Error al consultar compras a proveedores:", error);
        res.status(500).json({ error: "Error interno al consultar las compras a proveedores." });
    }
};

// HU-28: Registrar una nueva compra a proveedor
const registrarCompraProveedor = async (req, res) => {
    try {
        const { id_proveedor, numero_comprobante, fecha_compra, monto_total, observaciones } = req.body;

        // Validaciones de campos obligatorios
        if (!id_proveedor || !numero_comprobante || !fecha_compra || monto_total === undefined || monto_total === "") {
            return res.status(400).json({
                error: "Los campos proveedor, número de comprobante, fecha de compra y monto total son obligatorios."
            });
        }

        const montoNumerico = Number(monto_total);
        if (isNaN(montoNumerico) || montoNumerico < 0) {
            return res.status(400).json({
                error: "El monto total debe ser un número válido mayor o igual a 0."
            });
        }

        // Verificar que el proveedor exista
        const proveedorExiste = await pool.query(
            "SELECT id_proveedor, nombre FROM proveedores WHERE id_proveedor = $1 AND activo = TRUE",
            [id_proveedor]
        );

        if (proveedorExiste.rowCount === 0) {
            return res.status(404).json({ error: "El proveedor seleccionado no existe o no está activo." });
        }

        // Insertar la compra quedando en estado PENDIENTE_DETALLE para HU-29
        const insertQuery = `
            INSERT INTO compras_proveedores 
                (id_proveedor, numero_comprobante, fecha_compra, monto_total, observaciones, estado)
            VALUES ($1, $2, $3, $4, $5, 'PENDIENTE_DETALLE')
            RETURNING *
        `;

        const result = await pool.query(insertQuery, [
            id_proveedor,
            numero_comprobante.trim(),
            fecha_compra,
            montoNumerico,
            observaciones ? observaciones.trim() : null
        ]);

        res.status(201).json({
            mensaje: "Compra a proveedor registrada correctamente y disponible para cargar su detalle.",
            compra: {
                ...result.rows[0],
                proveedor_nombre: proveedorExiste.rows[0].nombre
            }
        });
    } catch (error) {
        console.error("Error al registrar compra a proveedor:", error);
        res.status(500).json({ error: "Error interno al registrar la compra al proveedor." });
    }
};

module.exports = {
    obtenerProveedores,
    obtenerComprasProveedores,
    registrarCompraProveedor
};