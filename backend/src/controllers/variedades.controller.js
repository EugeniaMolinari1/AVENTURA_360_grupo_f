const { validarVariedad, normalizarVariedad } = require("../validators/variedades.validator");
const { registrarVariedad } = require("../services/variedades.service");

function crearRegistrarVariedad(pool) {
    return async (req, res) => {
        try {
            const errores = validarVariedad(req.body);

            if (errores.length) {
                return res.status(400).json({ errores });
            }

            const variedad = await registrarVariedad(
                pool,
                normalizarVariedad(req.body)
            );

            return res.status(201).json(variedad);
        } catch (error) {
            if (error.status === 400 || error.status === 404) {
                return res.status(error.status).json({
                    errores: [error.message],
                });
            }

            console.error("Error al registrar variedad:", error);

            return res.status(500).json({
                error: "No se pudo registrar la variedad.",
            });
        }
    };
}

module.exports = { crearRegistrarVariedad };
