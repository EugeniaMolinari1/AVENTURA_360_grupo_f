const { Router } = require("express");
const {
    crearRegistrarProducto,
    crearObtenerProducto,
    crearModificarProducto,
} = require("../controllers/productos.controller");
const upload = require("../middlewares/upload.middleware");

function crearRutasProductos(pool, servicioImagenes) {
    const router = Router();

    // HU-19 - Registrar producto
    router.post(
        "/",
        upload.array("imagenes"),
        crearRegistrarProducto(pool, servicioImagenes)
    );

    // HU-20 - Obtener producto para cargar sus datos en la modificación
    router.get(
        "/:id",
        crearObtenerProducto(pool)
    );

    // HU-20 - Modificar producto
    router.put(
        "/:id",
        upload.array("imagenes"),
        crearModificarProducto(pool, servicioImagenes)
    );

    return router;
}

module.exports = { crearRutasProductos };