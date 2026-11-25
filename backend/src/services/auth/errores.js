// Motivos que el frontend puede mostrar al usuario. No contienen detalles del
// proveedor ni datos sensibles.
const MOTIVOS = [
    "cancelado",
    "estado_invalido",
    "sin_email",
    "email_no_verificado",
    "email_en_uso",
    "datos_incompletos",
    "proveedor_error",
    "no_disponible",
    "ya_autenticado",
];

class ErrorAutenticacion extends Error {
    constructor(motivo) {
        super(motivo);
        this.name = "ErrorAutenticacion";
        this.motivo = motivo;
    }
}

module.exports = { ErrorAutenticacion, MOTIVOS };
