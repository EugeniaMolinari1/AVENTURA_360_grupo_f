const CODIGO_VIOLACION_UNICA = "23505";
const INDICE_DUPLICADOS = "variedad_producto_caracteristicas_uq";

function errorNegocio(mensaje, status) {
    const error = new Error(mensaje);
    error.status = status;
    return error;
}

async function registrarVariedad(pool, datos) {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        // FOR SHARE impide que el producto se elimine o desactive mientras se registra la variedad.
        const { rows: [producto] } = await cliente.query(
            "SELECT activo FROM producto WHERE id_producto = $1 FOR SHARE",
            [datos.id_producto],
        );
        if (!producto) throw errorNegocio("El producto indicado no existe.", 404);
        if (!producto.activo) throw errorNegocio("El producto indicado no esta activo.", 400);
        const { rows: [variedad] } = await cliente.query(
            `INSERT INTO variedad (id_producto, color, medida, tamano_capacidad, stock, stock_minimo)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [datos.id_producto, datos.color, datos.medida, datos.tamano_capacidad, datos.stock, datos.stock_minimo],
        );
        await cliente.query("COMMIT");
        return variedad;
    } catch (error) {
        await cliente.query("ROLLBACK");
        if (error.code === CODIGO_VIOLACION_UNICA && error.constraint === INDICE_DUPLICADOS) {
            throw errorNegocio("Ya existe una variedad de este producto con las mismas caracteristicas.", 400);
        }
        throw error;
    } finally {
        cliente.release();
    }
}

module.exports = { registrarVariedad };
