const { PROVEEDORES_PERMITIDOS } = require("../services/auth/proveedores");

const MAX_LARGO_NOMBRE = 100;
const MAX_LARGO_CORREO = 254;
const MAX_LARGO_CODIGO = 2048;
const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function esProveedorPermitido(valor) {
    return PROVEEDORES_PERMITIDOS.includes(valor);
}

function cadena(valor) {
    return typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "";
}

// Devuelve el codigo de autorizacion del callback, o null si no es valido.
function leerCodigo(query) {
    const { code } = query ?? {};

    return typeof code === "string" && code && code.length <= MAX_LARGO_CODIGO
        ? code
        : null;
}

// Valida el perfil obtenido del proveedor. Devuelve el motivo del rechazo, o
// null si es valido. No devuelve mensajes sino motivos para el frontend.
function validarPerfil(perfil) {
    if (perfil === null || typeof perfil !== "object") {
        return "datos_incompletos";
    }

    if (!cadena(perfil.id_proveedor) || !esProveedorPermitido(perfil.proveedor)) {
        return "datos_incompletos";
    }

    const correo = cadena(perfil.correo_electronico);

    if (!correo) return "sin_email";

    if (correo.length > MAX_LARGO_CORREO || !FORMATO_CORREO.test(correo)) {
        return "datos_incompletos";
    }

    if (!cadena(perfil.nombre)) return "datos_incompletos";

    return null;
}

// Devuelve los datos listos para persistir. El correo se guarda en minusculas.
function normalizarPerfil(perfil) {
    return {
        proveedor: perfil.proveedor,
        id_proveedor: cadena(perfil.id_proveedor),
        nombre: cadena(perfil.nombre).slice(0, MAX_LARGO_NOMBRE),
        apellido: cadena(perfil.apellido).slice(0, MAX_LARGO_NOMBRE) || null,
        correo_electronico: cadena(perfil.correo_electronico).toLowerCase(),
    };
}

module.exports = {
    esProveedorPermitido,
    leerCodigo,
    validarPerfil,
    normalizarPerfil,
};
