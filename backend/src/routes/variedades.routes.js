const { Router } = require("express");
const { crearRegistrarVariedad } = require("../controllers/variedades.controller");

function crearRutasVariedades(pool) {
    const router = Router();

    router.post("/", crearRegistrarVariedad(pool));

    return router;
}

module.exports = { crearRutasVariedades };
