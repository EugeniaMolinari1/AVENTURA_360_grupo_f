const MAX_INTEGER = 2147483647;
const caracteristicas = ["color", "medida", "tamano_capacidad"];
const permitidos = ["id_producto", "stock", "stock_minimo", ...caracteristicas];

function objeto(valor) {
    return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

// Recorta los extremos y colapsa espacios internos; la comparacion sin
// distinguir mayusculas queda a cargo del indice unico de PostgreSQL.
function normalizarTexto(valor) {
    return valor.trim().replace(/\s+/g, " ");
}

function enteroNoNegativo(valor) {
    return Number.isInteger(valor) && valor >= 0 && valor <= MAX_INTEGER;
}

function validarVariedad(body) {
    const errores = [];
    if (!objeto(body)) return ["El cuerpo debe ser un objeto JSON."];
    for (const campo of Object.keys(body)) {
        if (!permitidos.includes(campo)) errores.push(`Campo no permitido: ${campo}.`);
    }
    if (!Number.isInteger(body.id_producto) || body.id_producto <= 0 || body.id_producto > MAX_INTEGER) {
        errores.push("id_producto debe ser un entero positivo dentro del rango de PostgreSQL.");
    }
    for (const campo of ["stock", "stock_minimo"]) {
        if (!enteroNoNegativo(body[campo])) {
            errores.push(`${campo} es obligatorio y debe ser un entero mayor o igual a 0 dentro del rango de PostgreSQL.`);
        }
    }
    let informadas = 0;
    for (const campo of caracteristicas) {
        const valor = body[campo];
        // Ausente o null significa "sin informar"; un texto en blanco es invalido.
        if (valor === undefined || valor === null) continue;
        informadas += 1;
        if (typeof valor !== "string" || !valor.trim()) {
            errores.push(`${campo} debe ser texto no vacio o null.`);
        }
    }
    if (informadas === 0) {
        errores.push("Debe informar al menos una caracteristica: color, medida o tamano_capacidad.");
    }
    return errores;
}

// Devuelve los datos listos para persistir: textos normalizados y NULL para lo no informado.
function normalizarVariedad(body) {
    const datos = {
        id_producto: body.id_producto,
        stock: body.stock,
        stock_minimo: body.stock_minimo,
    };
    for (const campo of caracteristicas) {
        datos[campo] = typeof body[campo] === "string" ? normalizarTexto(body[campo]) : null;
    }
    return datos;
}

module.exports = { validarVariedad, normalizarVariedad };
