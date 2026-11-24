const { Router } = require("express");

const {
    crearRegistrarProducto,
    crearObtenerProducto,
    crearModificarProducto,
    crearDarDeBajaProducto,
    crearObtenerCatalogo,
    crearBuscarProductos,
} = require("../controllers/productos.controller");

const upload =
    require("../middlewares/upload.middleware");

function crearRutasProductos(
    pool,
    servicioImagenes
) {
    const router = Router();

    // HU-19 - Registrar producto
    router.post(
        "/",
        upload.array("imagenes"),
        crearRegistrarProducto(
            pool,
            servicioImagenes
        )
    );

    // HU-01 - Navegar catalogo
    router.get(
        "/",
        crearObtenerCatalogo(pool)
    );

    // HU-02 - Buscar productos
    router.get(
        "/buscar",
        crearBuscarProductos(pool)
    );

    // HU-20 - Obtener producto para cargar sus datos
    // en la modificacion
    router.get(
        "/:id",
        crearObtenerProducto(pool)
    );

    // HU-20 - Modificar producto
    router.put(
        "/:id",
        upload.array("imagenes"),
        crearModificarProducto(
            pool,
            servicioImagenes
        )
    );

    // HU-21 - Dar de baja producto
    router.delete(
        "/:id",
        crearDarDeBajaProducto(pool)
    );

    return router;
}

module.exports = {
    crearRutasProductos,
};