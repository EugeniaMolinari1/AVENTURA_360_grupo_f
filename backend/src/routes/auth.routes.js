const { Router } = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { leerConfiguracionAuth } = require("../config/auth");
const { crearProveedores } = require("../services/auth/proveedores");
const {
    crearIniciarAutenticacion,
    crearCallback,
    crearUsuarioActual,
} = require("../controllers/auth.controller");

function crearRutasAuth(
    pool,
    {
        config = leerConfiguracionAuth(),
        proveedores = crearProveedores(config),
    } = {}
) {
    const router = Router();

    // CORS propio con credenciales: las cookies exigen un origen explicito.
    router.use(
        cors({ origin: config.frontendOrigin, credentials: true })
    );
    router.use(cookieParser());
    router.use((req, res, next) => {
        res.set("Cache-Control", "no-store");
        next();
    });

    // HU-06 - Registrarse mediante una red social
    router.get("/me", crearUsuarioActual(pool, config));
    router.get("/:proveedor", crearIniciarAutenticacion(config, proveedores));
    router.get(
        "/:proveedor/callback",
        crearCallback(pool, config, proveedores)
    );

    return router;
}

module.exports = { crearRutasAuth };
