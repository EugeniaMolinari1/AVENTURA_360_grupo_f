const { Router } = require("express");
const { crearRegistrarProducto } = require("../controllers/productos.controller");
const upload = require("../middlewares/upload.middleware");

function crearRutasProductos(pool, servicioImagenes) {
    const router = Router();

    router.post(
        "/",
        upload.array("imagenes"),
        crearRegistrarProducto(pool, servicioImagenes)
    );

    return router;
}

module.exports = { crearRutasProductos };