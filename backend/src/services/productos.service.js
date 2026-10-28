const inserciones = {
    carpa: { sql: "INSERT INTO carpa (id_producto, capacidad_personas, peso_kg) VALUES ($1, $2, $3) RETURNING capacidad_personas, peso_kg", campos: ["capacidad_personas", "peso_kg"] },
    mochila: { sql: "INSERT INTO mochila (id_producto, capacidad_litros) VALUES ($1, $2) RETURNING capacidad_litros", campos: ["capacidad_litros"] },
    termo: { sql: "INSERT INTO termo (id_producto, capacidad_ml, termico) VALUES ($1, $2, $3) RETURNING capacidad_ml, termico", campos: ["capacidad_ml", "termico"] },
    accesorio: { sql: "INSERT INTO accesorio (id_producto, tipo_accesorio) VALUES ($1, $2) RETURNING tipo_accesorio", campos: ["tipo_accesorio"] },
};

async function registrarProducto(pool, datos, imagenes) {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        const ocasiones = await cliente.query(
            "SELECT id_ocasion FROM ocasion WHERE id_ocasion = ANY($1::integer[]) FOR KEY SHARE",
            [datos.ocasiones],
        );
        if (ocasiones.rowCount !== datos.ocasiones.length) {
            const error = new Error("Una o mas ocasiones no existen.");
            error.status = 400;
            throw error;
        }
        const { rows: [producto] } = await cliente.query(
            `INSERT INTO producto (nombre, descripcion, marca, precio, dimensiones)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [datos.nombre, datos.descripcion, datos.marca, String(datos.precio), datos.dimensiones],
        );
        const subtipo = inserciones[datos.tipo];
        const { rows: [detalle] } = await cliente.query(subtipo.sql,
            [producto.id_producto, ...subtipo.campos.map(campo => datos.detalle[campo])]);
        await cliente.query(
            "INSERT INTO producto_ocasion (id_producto, id_ocasion) SELECT $1, unnest($2::integer[])",
            [producto.id_producto, datos.ocasiones],
        );
        for (const imagen of imagenes) {
            await cliente.query(
                `INSERT INTO imagen (id_producto, url, public_id, principal)
         VALUES ($1, $2, $3, $4)`,
                [
                    producto.id_producto,
                    imagen.url,
                    imagen.public_id,
                    imagen.principal,
                ]
            );
        }
        await cliente.query("COMMIT");
        return { ...producto, tipo: datos.tipo, detalle, ocasiones: datos.ocasiones };
    } catch (error) {
        await cliente.query("ROLLBACK");
        throw error;
    } finally {
        cliente.release();
    }
}

module.exports = { registrarProducto };
