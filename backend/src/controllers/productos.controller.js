const {
    validarProducto,
    validarIdProducto,
    validarImagenesConservadas,
} = require("../validators/productos.validator");

const {
    registrarProducto,
    obtenerProductoPorId,
    modificarProducto,
} = require("../services/productos.service");

const imagenesService = require("../services/imagenes.service");

function convertirJson(body) {
    if (typeof body.detalle === "string") {
        body.detalle = JSON.parse(body.detalle);
    }

    if (typeof body.ocasiones === "string") {
        body.ocasiones = JSON.parse(body.ocasiones);
    }

    if (
        typeof body.imagenes_conservadas === "string"
    ) {
        body.imagenes_conservadas = JSON.parse(
            body.imagenes_conservadas
        );
    }
}

async function eliminarImagenesSubidas(
    servicioImagenes,
    imagenes
) {
    for (const imagen of imagenes) {
        try {
            await servicioImagenes.eliminarImagen(
                imagen.public_id
            );
        } catch (error) {
            console.error(
                "Error al eliminar imagen de Cloudinary:",
                error
            );
        }
    }
}

function crearRegistrarProducto(
    pool,
    servicioImagenes = imagenesService
) {
    return async (req, res) => {
        let imagenesSubidas = [];

        try {
            convertirJson(req.body);

            const errores = validarProducto(req.body);

            if (!req.files || req.files.length === 0) {
                errores.push(
                    "Debe ingresar al menos una imagen."
                );
            }

            if (errores.length) {
                return res.status(400).json({ errores });
            }

            imagenesSubidas = await Promise.all(
                req.files.map((archivo) =>
                    servicioImagenes.subirImagen(
                        archivo.buffer
                    )
                )
            );

            const imagenes = imagenesSubidas.map(
                (imagen, index) => ({
                    ...imagen,
                    principal: index === 0,
                })
            );

            const producto = await registrarProducto(
                pool,
                req.body,
                imagenes
            );

            return res.status(201).json(producto);
        } catch (error) {
            await eliminarImagenesSubidas(
                servicioImagenes,
                imagenesSubidas
            );

            if (error instanceof SyntaxError) {
                return res.status(400).json({
                    errores: [
                        "Detalle u ocasiones tienen un formato invalido.",
                    ],
                });
            }

            if (error.status === 400) {
                return res.status(400).json({
                    errores: [error.message],
                });
            }

            console.error(
                "Error al registrar producto:",
                error
            );

            return res.status(500).json({
                error:
                    "No se pudo registrar el producto.",
            });
        }
    };
}

function crearObtenerProducto(pool) {
    return async (req, res) => {
        try {
            const idProducto = validarIdProducto(
                req.params.id
            );

            if (!idProducto) {
                return res.status(400).json({
                    errores: [
                        "El identificador del producto no es valido.",
                    ],
                });
            }

            const producto = await obtenerProductoPorId(
                pool,
                idProducto
            );

            if (!producto) {
                return res.status(404).json({
                    error: "El producto no existe.",
                });
            }

            return res.json(producto);
        } catch (error) {
            console.error(
                "Error al obtener producto:",
                error
            );

            return res.status(500).json({
                error:
                    "No se pudo obtener el producto.",
            });
        }
    };
}

function crearModificarProducto(
    pool,
    servicioImagenes = imagenesService
) {
    return async (req, res) => {
        let imagenesSubidas = [];

        try {
            const idProducto = validarIdProducto(
                req.params.id
            );

            if (!idProducto) {
                return res.status(400).json({
                    errores: [
                        "El identificador del producto no es valido.",
                    ],
                });
            }

            convertirJson(req.body);

            const imagenesConservadas =
                validarImagenesConservadas(
                    req.body.imagenes_conservadas
                );

            if (imagenesConservadas === null) {
                return res.status(400).json({
                    errores: [
                        "imagenes_conservadas debe contener identificadores enteros positivos sin repetir.",
                    ],
                });
            }

            delete req.body.imagenes_conservadas;

            const errores = validarProducto(req.body);

            if (errores.length) {
                return res.status(400).json({ errores });
            }

            imagenesSubidas = await Promise.all(
                (req.files || []).map((archivo) =>
                    servicioImagenes.subirImagen(
                        archivo.buffer
                    )
                )
            );

            const resultado = await modificarProducto(
                pool,
                idProducto,
                req.body,
                imagenesConservadas,
                imagenesSubidas
            );

            for (
                const imagen
                of resultado.imagenesEliminadas
            ) {
                try {
                    await servicioImagenes.eliminarImagen(
                        imagen.public_id
                    );
                } catch (errorEliminar) {
                    console.error(
                        "El producto fue modificado, pero no se pudo eliminar una imagen anterior de Cloudinary:",
                        errorEliminar
                    );
                }
            }

            const productoActualizado =
                await obtenerProductoPorId(
                    pool,
                    idProducto
                );

            return res.json(productoActualizado);
        } catch (error) {
            await eliminarImagenesSubidas(
                servicioImagenes,
                imagenesSubidas
            );

            if (error instanceof SyntaxError) {
                return res.status(400).json({
                    errores: [
                        "Detalle, ocasiones o imagenes_conservadas tienen un formato invalido.",
                    ],
                });
            }

            if (
                error.status === 400 ||
                error.status === 404
            ) {
                return res.status(error.status).json({
                    errores: [error.message],
                });
            }

            console.error(
                "Error al modificar producto:",
                error
            );

            return res.status(500).json({
                error:
                    "No se pudo modificar el producto.",
            });
        }
    };
}

module.exports = {
    crearRegistrarProducto,
    crearObtenerProducto,
    crearModificarProducto,
};