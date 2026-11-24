const { Router } = require("express");

const {
    crearRegistrarVariedad,
    crearConsultarStockPorProducto,
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

    return router;
}

module.exports = { crearRutasVariedades };