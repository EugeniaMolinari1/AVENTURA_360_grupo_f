const camposDetalle = {
    carpa: ["capacidad_personas", "peso_kg"],
    mochila: ["capacidad_litros"],
    termo: ["capacidad_ml", "termico"],
    accesorio: ["tipo_accesorio"],
};

function objeto(valor) {
    return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

function validarProducto(body) {
    const errores = [];
    if (!objeto(body)) return ["El cuerpo debe ser un objeto JSON."];
    const permitidos = ["nombre", "descripcion", "marca", "precio", "dimensiones", "tipo", "detalle", "ocasiones"];
    for (const campo of Object.keys(body)) {
        if (!permitidos.includes(campo)) errores.push(`Campo no permitido: ${campo}.`);
    }
    for (const campo of ["nombre", "descripcion", "marca", "dimensiones"]) {
        if (typeof body[campo] !== "string" || !body[campo].trim()) errores.push(`${campo} debe ser texto no vacio.`);
    }
    // Se admite texto decimal para conservar la precision monetaria sin usar floats.
    if (!["number", "string"].includes(typeof body.precio)
        || !/^\d+(?:\.\d{1,2})?$/.test(String(body.precio))
        || !/[1-9]/.test(String(body.precio))) {
        errores.push("precio debe ser positivo y tener hasta dos decimales, sin notacion exponencial.");
    }
    const campos = typeof body.tipo === "string" && Object.hasOwn(camposDetalle, body.tipo)
        ? camposDetalle[body.tipo] : null;
    if (!campos) errores.push("tipo debe ser carpa, mochila, termo o accesorio.");
    if (!objeto(body.detalle)) {
        errores.push("detalle debe ser un objeto con los campos del subtipo.");
    } else if (campos) {
        for (const campo of Object.keys(body.detalle)) {
            if (!campos.includes(campo)) errores.push(`Campo no permitido en detalle: ${campo}.`);
        }
        for (const campo of campos) {
            const valor = body.detalle[campo];
            if (campo.startsWith("capacidad_")) {
                if (!Number.isInteger(valor) || valor <= 0 || valor > 2147483647) errores.push(`${campo} debe ser un entero positivo dentro del rango de PostgreSQL.`);
            } else if (campo === "peso_kg") {
                if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) errores.push("peso_kg debe ser un numero positivo y finito.");
            } else if (campo === "termico") {
                if (typeof valor !== "boolean") errores.push("termico debe ser booleano.");
            } else if (typeof valor !== "string" || !valor.trim()) {
                errores.push("tipo_accesorio debe ser texto no vacio.");
            }
        }
    }
    if (!Array.isArray(body.ocasiones) || body.ocasiones.length === 0
        || body.ocasiones.some(id => !Number.isInteger(id) || id <= 0 || id > 2147483647)
        || new Set(body.ocasiones).size !== body.ocasiones.length) {
        errores.push("ocasiones debe contener identificadores enteros positivos sin repetir y al menos uno.");
    }
    return errores;
}

module.exports = { validarProducto };
