const { validarProducto } = require("../validators/productos.validator");
const { registrarProducto } = require("../services/productos.service");
const imagenesService = require("../services/imagenes.service");

function crearRegistrarProducto(pool, servicioImagenes = imagenesService) {
    return async (req, res) => {
        let imagenesSubidas = [];

        try {
            if (typeof req.body.detalle === "string") {
                req.body.detalle = JSON.parse(req.body.detalle);
            }

            if (typeof req.body.ocasiones === "string") {
                req.body.ocasiones = JSON.parse(req.body.ocasiones);
            }

            const errores = validarProducto(req.body);

            if (!req.files || req.files.length === 0) {
                errores.push("Debe ingresar al menos una imagen.");
            }

            if (errores.length) {
                return res.status(400).json({ errores });
            }

            imagenesSubidas = await Promise.all(
                req.files.map((archivo) =>
                    servicioImagenes.subirImagen(archivo.buffer)
                )
            );

            const imagenes = imagenesSubidas.map((imagen, index) => ({
                ...imagen,
                principal: index === 0,
            }));

            const producto = await registrarProducto(
                pool,
                req.body,
                imagenes
            );

            return res.status(201).json(producto);
        } catch (error) {
            for (const imagen of imagenesSubidas) {
                try {
                    await servicioImagenes.eliminarImagen(imagen.public_id);
                } catch (errorEliminar) {
                    console.error(
                        "Error al eliminar imagen de Cloudinary:",
                        errorEliminar
                    );
                }
            }

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

            console.error("Error al registrar producto:", error);

            return res.status(500).json({
                error: "No se pudo registrar el producto.",
            });
        }
    };
}

module.exports = { crearRegistrarProducto };