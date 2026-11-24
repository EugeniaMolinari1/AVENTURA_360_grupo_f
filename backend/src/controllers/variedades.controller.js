const {
    validarVariedad,
    normalizarVariedad,
} = require("../validators/variedades.validator");

const {
    registrarVariedad,
    consultarStockPorProducto,
} = require("../services/variedades.service");

function validarIdProducto(valor) {
    const idProducto = Number(valor);

    if (
        !Number.isInteger(idProducto) ||
        idProducto <= 0 ||
        idProducto > 2147483647
    ) {
        return null;
    }

    return idProducto;
}

function crearRegistrarVariedad(pool) {
    return async (req, res) => {
        try {
            const errores = validarVariedad(req.body);

            if (errores.length) {
                return res.status(400).json({
                    errores,
                });
            }

            const variedad = await registrarVariedad(
                pool,
                normalizarVariedad(req.body)
            );

            return res.status(201).json(variedad);
        } catch (error) {
            if (
                error.status === 400 ||
                error.status === 404
            ) {
                return res.status(error.status).json({
                    errores: [error.message],
                });
            }

            console.error(
                "Error al registrar variedad:",
                error
            );

            return res.status(500).json({
                error:
                    "No se pudo registrar la variedad.",
            });
        }
    };
}

function crearConsultarStockPorProducto(pool) {
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

            const resultado =
                await consultarStockPorProducto(
                    pool,
                    idProducto
                );

            return res.json(resultado);
        } catch (error) {
            if (
                error.status === 400 ||
                error.status === 404
            ) {
                return res.status(error.status).json({
                    errores: [error.message],
                });
            }

            console.error(
                "Error al consultar stock:",
                error
            );

            return res.status(500).json({
                error:
                    "No se pudo consultar el stock del producto.",
            });
        }
    };
}

module.exports = {
    crearRegistrarVariedad,
    crearConsultarStockPorProducto,
};