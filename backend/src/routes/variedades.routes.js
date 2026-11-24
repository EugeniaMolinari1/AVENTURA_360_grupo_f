const { Router } = require("express");

const {
    crearRegistrarVariedad,
    crearConsultarStockPorProducto,
    crearGestionarStock,
} = require("../controllers/variedades.controller");

function crearRutasVariedades(pool) {
    const router = Router();

    // HU-26 - Registrar variedad
    router.post(
        "/",
        crearRegistrarVariedad(pool)
    );

    // HU-22 - Consultar stock de las variedades
    // correspondientes a un producto.
    router.get(
        "/producto/:id/stock",
        crearConsultarStockPorProducto(pool)
    );

    // HU-23 - Gestionar stock de una variedad.
    router.patch(
        "/:id/stock",
        crearGestionarStock(pool)
    );

    return router;
}

module.exports = { crearRutasVariedades };