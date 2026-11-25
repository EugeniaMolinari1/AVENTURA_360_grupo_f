const { randomBytes, createHash, timingSafeEqual } = require("node:crypto");
const {
    esProveedorPermitido,
    leerCodigo,
    validarPerfil,
    normalizarPerfil,
} = require("../validators/auth.validator");
const {
    autenticarConIdentidad,
    buscarUsuarioPorId,
} = require("../services/auth.service");
const {
    COOKIE_SESION,
    COOKIE_OAUTH,
    DIAS_SESION,
    MINUTOS_OAUTH,
    firmarSesion,
    leerSesion,
    firmarEstadoOAuth,
    leerEstadoOAuth,
    opcionesCookie,
} = require("../services/sesion.service");
const { ErrorAutenticacion } = require("../services/auth/errores");

const PATH_OAUTH = "/api/auth";
const aleatorio = (bytes) => randomBytes(bytes).toString("base64url");

function compararSeguro(a, b) {
    if (typeof a !== "string" || typeof b !== "string") return false;

    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);

    return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

// Redirige siempre a FRONTEND_URL (configuracion), nunca a un destino recibido
// en la peticion. Solo agrega el resultado como parametros de consulta.
function redirigirAlFrontend(res, config, resultado) {
    const url = new URL(config.frontendUrl);

    for (const [clave, valor] of Object.entries(resultado)) {
        url.searchParams.set(clave, valor);
    }

    return res.redirect(302, url.toString());
}

const redirigirError = (res, config, motivo) =>
    redirigirAlFrontend(res, config, { auth: "error", motivo });

function crearIniciarAutenticacion(config, proveedores) {
    return async (req, res) => {
        const { proveedor: nombre } = req.params;

        if (!esProveedorPermitido(nombre)) {
            return res.status(404).json({ errores: ["Proveedor no soportado."] });
        }

        try {
            const proveedor = proveedores[nombre];

            if (!proveedor || !config.sessionSecret) {
                return redirigirError(res, config, "no_disponible");
            }

            // UC-05: el invitado no debe estar autenticado.
            if (await leerSesion(config, req.cookies?.[COOKIE_SESION])) {
                return redirigirError(res, config, "ya_autenticado");
            }

            const state = aleatorio(24);
            const nonce = aleatorio(24);
            const codigoVerificador = aleatorio(32);
            const codeChallenge = createHash("sha256")
                .update(codigoVerificador)
                .digest("base64url");

            res.cookie(
                COOKIE_OAUTH,
                await firmarEstadoOAuth(config, {
                    proveedor: nombre,
                    state,
                    nonce,
                    verificador: codigoVerificador,
                }),
                {
                    ...opcionesCookie(config, PATH_OAUTH),
                    maxAge: MINUTOS_OAUTH * 60 * 1000,
                }
            );

            return res.redirect(
                302,
                proveedor.iniciar({ state, nonce, codeChallenge })
            );
        } catch (error) {
            console.error("Error al iniciar la autenticacion:", error.message);

            return redirigirError(res, config, "proveedor_error");
        }
    };
}

function crearCallback(pool, config, proveedores) {
    return async (req, res) => {
        const { proveedor: nombre } = req.params;

        if (!esProveedorPermitido(nombre)) {
            return res.status(404).json({ errores: ["Proveedor no soportado."] });
        }

        // El estado de OAuth se descarta tras cada intento (el codigo de
        // autorizacion tambien es de un solo uso en el proveedor).
        res.clearCookie(COOKIE_OAUTH, opcionesCookie(config, PATH_OAUTH));

        try {
            const proveedor = proveedores[nombre];

            if (!proveedor || !config.sessionSecret) {
                throw new ErrorAutenticacion("no_disponible");
            }

            const estado = await leerEstadoOAuth(
                config,
                req.cookies?.[COOKIE_OAUTH]
            );

            if (
                !estado ||
                estado.proveedor !== nombre ||
                !compararSeguro(estado.state, req.query.state)
            ) {
                throw new ErrorAutenticacion("estado_invalido");
            }

            // Cancelacion o rechazo del usuario en el proveedor.
            if (req.query.error !== undefined) {
                throw new ErrorAutenticacion(
                    req.query.error === "access_denied"
                        ? "cancelado"
                        : "proveedor_error"
                );
            }

            const code = leerCodigo(req.query);

            if (!code) throw new ErrorAutenticacion("proveedor_error");

            // La identidad sale solo de lo verificado con el proveedor.
            const perfil = await proveedor.completar({
                code,
                codigoVerificador: estado.verificador,
                nonce: estado.nonce,
            });

            const motivo = validarPerfil(perfil);

            if (motivo) throw new ErrorAutenticacion(motivo);

            const usuario = await autenticarConIdentidad(
                pool,
                normalizarPerfil(perfil)
            );

            res.cookie(
                COOKIE_SESION,
                await firmarSesion(config, usuario.id_usuario),
                {
                    ...opcionesCookie(config, "/"),
                    maxAge: DIAS_SESION * 24 * 60 * 60 * 1000,
                }
            );

            return redirigirAlFrontend(res, config, { auth: "ok" });
        } catch (error) {
            if (error instanceof ErrorAutenticacion) {
                return redirigirError(res, config, error.motivo);
            }

            // Solo el mensaje: nunca tokens, secretos ni respuestas del proveedor.
            console.error("Error en el callback de autenticacion:", error.message);

            return redirigirError(res, config, "proveedor_error");
        }
    };
}

function crearUsuarioActual(pool, config) {
    return async (req, res) => {
        try {
            const idUsuario = await leerSesion(
                config,
                req.cookies?.[COOKIE_SESION]
            );
            const usuario = idUsuario
                ? await buscarUsuarioPorId(pool, idUsuario)
                : null;

            if (!usuario) {
                return res.status(401).json({ errores: ["No autenticado."] });
            }

            return res.json(usuario);
        } catch (error) {
            console.error("Error al consultar la sesion:", error.message);

            return res.status(500).json({
                error: "No se pudo consultar la sesion.",
            });
        }
    };
}

module.exports = {
    crearIniciarAutenticacion,
    crearCallback,
    crearUsuarioActual,
};
