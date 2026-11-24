const express = require("express");
const router = express.Router();
const {
    obtenerProveedores,
    obtenerComprasProveedores,
    registrarCompraProveedor
} = require("../controllers/comprasProveedores.controller");

// Rutas administrativas para HU-28
router.get("/proveedores", obtenerProveedores);
router.get("/compras-proveedores", obtenerComprasProveedores);
router.post("/compras-proveedores", registrarCompraProveedor);

module.exports = router;