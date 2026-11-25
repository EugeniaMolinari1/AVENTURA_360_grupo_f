const { crearProveedorGoogle } = require("./google");
const { crearProveedorFacebook } = require("./facebook");

const PROVEEDORES_PERMITIDOS = ["google", "facebook"];

// Devuelve solo los proveedores que tienen credenciales configuradas.
function crearProveedores(config) {
    const proveedores = {};
    const redirectUri = (nombre) =>
        `${config.backendUrl}/api/auth/${nombre}/callback`;

    if (config.google) {
        proveedores.google = crearProveedorGoogle(
            config.google,
            redirectUri("google")
        );
    }

    if (config.facebook) {
        proveedores.facebook = crearProveedorFacebook(
            config.facebook,
            redirectUri("facebook")
        );
    }

    return proveedores;
}

module.exports = { crearProveedores, PROVEEDORES_PERMITIDOS };
