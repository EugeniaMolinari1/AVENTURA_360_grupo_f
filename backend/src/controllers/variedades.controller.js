const {
    validarVariedad,
    normalizarVariedad,
    validarGestionStock,
} = require("../validators/variedades.validator");

const {
    registrarVariedad,
    consultarStockPorProducto,
    gestionarStock,
} = require("../services/variedades.service");

function validarId(valor) {
    const id = Number(valor);

    if (
        !Number.isInteger(id) ||
        id <= 0 ||
        id > 2147483647
    ) {
        return null;
    }

    return id;
}

function crearRegistrarVariedad(pool) {
    return async (req, res) => {
        try {
            const errores =
                validarVariedad(req.body);

            if (errores.length) {
                return res.status(400).json({
                    errores,
                });
            }

            const variedad =
                await registrarVariedad(
                    pool,
                    normalizarVariedad(req.body)
                );

            return res
                .status(201)
                .json(variedad);
        } catch (error) {
            if (
                error.status === 400 ||
                error.status === 404
            ) {
                return res
                    .status(error.status)
                    .json({
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
            const idProducto =
                validarId(req.params.id);

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
                return res
                    .status(error.status)
                    .json({
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

function crearGestionarStock(pool) {
    return async (req, res) => {
        try {
            const idVariedad =
                validarId(req.params.id);

            if (!idVariedad) {
                return res.status(400).json({
                    errores: [
                        "El identificador de la variedad no es valido.",
                    ],
                });
            }

            const errores =
                validarGestionStock(req.body);

            if (errores.length) {
                return res.status(400).json({
                    errores,
                });
            }

            const variedad =
                await gestionarStock(
                    pool,
                    idVariedad,
                    req.body.stock
                );

            return res.json(variedad);
        } catch (error) {
            if (
                error.status === 400 ||
                error.status === 404
            ) {
                return res
                    .status(error.status)
                    .json({
                        errores: [error.message],
                    });
            }

            console.error(
                "Error al gestionar stock:",
                error
            );

            return res.status(500).json({
                error:
                    "No se pudo actualizar el stock de la variedad.",
            });
        }
    };
}

module.exports = {
    crearRegistrarVariedad,
    crearConsultarStockPorProducto,
    crearGestionarStock,
};