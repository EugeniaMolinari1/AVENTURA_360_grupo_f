const inserciones = {
    carpa: {
        sql: `
            INSERT INTO carpa
                (id_producto, capacidad_personas, peso_kg)
            VALUES ($1, $2, $3)
            RETURNING capacidad_personas, peso_kg
        `,
        campos: ["capacidad_personas", "peso_kg"],
    },
    mochila: {
        sql: `
            INSERT INTO mochila
                (id_producto, capacidad_litros)
            VALUES ($1, $2)
            RETURNING capacidad_litros
        `,
        campos: ["capacidad_litros"],
    },
    termo: {
        sql: `
            INSERT INTO termo
                (id_producto, capacidad_ml, termico)
            VALUES ($1, $2, $3)
            RETURNING capacidad_ml, termico
        `,
        campos: ["capacidad_ml", "termico"],
    },
    accesorio: {
        sql: `
            INSERT INTO accesorio
                (id_producto, tipo_accesorio)
            VALUES ($1, $2)
            RETURNING tipo_accesorio
        `,
        campos: ["tipo_accesorio"],
    },
};

const actualizaciones = {
    carpa: {
        sql: `
            UPDATE carpa
            SET capacidad_personas = $2,
                peso_kg = $3
            WHERE id_producto = $1
            RETURNING capacidad_personas, peso_kg
        `,
        campos: ["capacidad_personas", "peso_kg"],
    },
    mochila: {
        sql: `
            UPDATE mochila
            SET capacidad_litros = $2
            WHERE id_producto = $1
            RETURNING capacidad_litros
        `,
        campos: ["capacidad_litros"],
    },
    termo: {
        sql: `
            UPDATE termo
            SET capacidad_ml = $2,
                termico = $3
            WHERE id_producto = $1
            RETURNING capacidad_ml, termico
        `,
        campos: ["capacidad_ml", "termico"],
    },
    accesorio: {
        sql: `
            UPDATE accesorio
            SET tipo_accesorio = $2
            WHERE id_producto = $1
            RETURNING tipo_accesorio
        `,
        campos: ["tipo_accesorio"],
    },
};

async function registrarProducto(pool, datos, imagenes) {
    const cliente = await pool.connect();

    try {
        await cliente.query("BEGIN");

        const ocasiones = await cliente.query(
            `SELECT id_ocasion
             FROM ocasion
             WHERE id_ocasion = ANY($1::integer[])
             FOR KEY SHARE`,
            [datos.ocasiones]
        );

        if (ocasiones.rowCount !== datos.ocasiones.length) {
            const error = new Error(
                "Una o mas ocasiones no existen."
            );
            error.status = 400;
            throw error;
        }

        const {
            rows: [producto],
        } = await cliente.query(
            `INSERT INTO producto
                (nombre, descripcion, marca, precio, dimensiones)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [
                datos.nombre,
                datos.descripcion,
                datos.marca,
                String(datos.precio),
                datos.dimensiones,
            ]
        );

        const subtipo = inserciones[datos.tipo];

        const {
            rows: [detalle],
        } = await cliente.query(
            subtipo.sql,
            [
                producto.id_producto,
                ...subtipo.campos.map(
                    (campo) => datos.detalle[campo]
                ),
            ]
        );

        await cliente.query(
            `INSERT INTO producto_ocasion
                (id_producto, id_ocasion)
             SELECT $1, unnest($2::integer[])`,
            [producto.id_producto, datos.ocasiones]
        );

        for (const imagen of imagenes) {
            await cliente.query(
                `INSERT INTO imagen
                    (id_producto, url, public_id, principal)
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

        return {
            ...producto,
            tipo: datos.tipo,
            detalle,
            ocasiones: datos.ocasiones,
        };
    } catch (error) {
        await cliente.query("ROLLBACK");
        throw error;
    } finally {
        cliente.release();
    }
}

async function detectarTipoProducto(cliente, idProducto) {
    for (const tipo of Object.keys(actualizaciones)) {
        const resultado = await cliente.query(
            `SELECT 1
             FROM ${tipo}
             WHERE id_producto = $1`,
            [idProducto]
        );

        if (resultado.rowCount === 1) {
            return tipo;
        }
    }

    return null;
}

async function obtenerProductoPorId(pool, idProducto) {
    const cliente = await pool.connect();

    try {
        const {
            rows: [producto],
        } = await cliente.query(
            `SELECT *
             FROM producto
             WHERE id_producto = $1`,
            [idProducto]
        );

        if (!producto) {
            return null;
        }

        const tipo = await detectarTipoProducto(
            cliente,
            idProducto
        );

        if (!tipo) {
            throw new Error(
                "El producto no posee un subtipo valido."
            );
        }

        const detalle = await cliente.query(
            `SELECT *
             FROM ${tipo}
             WHERE id_producto = $1`,
            [idProducto]
        );

        const ocasiones = await cliente.query(
            `SELECT id_ocasion
             FROM producto_ocasion
             WHERE id_producto = $1
             ORDER BY id_ocasion`,
            [idProducto]
        );

        const imagenes = await cliente.query(
            `SELECT
                id_imagen,
                url,
                public_id,
                principal
             FROM imagen
             WHERE id_producto = $1
             ORDER BY principal DESC, id_imagen`,
            [idProducto]
        );

        const detalleLimpio = {
            ...detalle.rows[0],
        };

        delete detalleLimpio.id_producto;

        return {
            ...producto,
            tipo,
            detalle: detalleLimpio,
            ocasiones: ocasiones.rows.map(
                (fila) => fila.id_ocasion
            ),
            imagenes: imagenes.rows,
        };
    } finally {
        cliente.release();
    }
}

async function modificarProducto(
    pool,
    idProducto,
    datos,
    imagenesConservadas,
    imagenesNuevas
) {
    const cliente = await pool.connect();

    try {
        await cliente.query("BEGIN");

        const productoExistente = await cliente.query(
            `SELECT *
             FROM producto
             WHERE id_producto = $1
             FOR UPDATE`,
            [idProducto]
        );

        if (productoExistente.rowCount === 0) {
            const error = new Error(
                "El producto no existe."
            );
            error.status = 404;
            throw error;
        }

        const tipoActual = await detectarTipoProducto(
            cliente,
            idProducto
        );

        if (!tipoActual) {
            throw new Error(
                "El producto no posee un subtipo valido."
            );
        }

        if (datos.tipo !== tipoActual) {
            const error = new Error(
                "No se puede modificar el tipo del producto."
            );
            error.status = 400;
            throw error;
        }

        const ocasiones = await cliente.query(
            `SELECT id_ocasion
             FROM ocasion
             WHERE id_ocasion = ANY($1::integer[])
             FOR KEY SHARE`,
            [datos.ocasiones]
        );

        if (ocasiones.rowCount !== datos.ocasiones.length) {
            const error = new Error(
                "Una o mas ocasiones no existen."
            );
            error.status = 400;
            throw error;
        }

        const imagenesActuales = await cliente.query(
            `SELECT
                id_imagen,
                url,
                public_id,
                principal
             FROM imagen
             WHERE id_producto = $1
             ORDER BY id_imagen
             FOR UPDATE`,
            [idProducto]
        );

        const idsActuales = new Set(
            imagenesActuales.rows.map(
                (imagen) => imagen.id_imagen
            )
        );

        const imagenAjena = imagenesConservadas.some(
            (id) => !idsActuales.has(id)
        );

        if (imagenAjena) {
            const error = new Error(
                "Una o mas imagenes indicadas no pertenecen al producto."
            );
            error.status = 400;
            throw error;
        }

        if (
            imagenesConservadas.length +
            imagenesNuevas.length ===
            0
        ) {
            const error = new Error(
                "El producto debe conservar al menos una imagen."
            );
            error.status = 400;
            throw error;
        }

        const {
            rows: [producto],
        } = await cliente.query(
            `UPDATE producto
             SET nombre = $2,
                 descripcion = $3,
                 marca = $4,
                 precio = $5,
                 dimensiones = $6
             WHERE id_producto = $1
             RETURNING *`,
            [
                idProducto,
                datos.nombre,
                datos.descripcion,
                datos.marca,
                String(datos.precio),
                datos.dimensiones,
            ]
        );

        const actualizacion =
            actualizaciones[tipoActual];

        const {
            rows: [detalle],
        } = await cliente.query(
            actualizacion.sql,
            [
                idProducto,
                ...actualizacion.campos.map(
                    (campo) => datos.detalle[campo]
                ),
            ]
        );

        await cliente.query(
            `DELETE FROM producto_ocasion
             WHERE id_producto = $1`,
            [idProducto]
        );

        await cliente.query(
            `INSERT INTO producto_ocasion
                (id_producto, id_ocasion)
             SELECT $1, unnest($2::integer[])`,
            [idProducto, datos.ocasiones]
        );

        const imagenesEliminadas =
            imagenesActuales.rows.filter(
                (imagen) =>
                    !imagenesConservadas.includes(
                        imagen.id_imagen
                    )
            );

        if (imagenesEliminadas.length > 0) {
            await cliente.query(
                `DELETE FROM imagen
                 WHERE id_producto = $1
                   AND NOT (
                       id_imagen = ANY($2::integer[])
                   )`,
                [
                    idProducto,
                    imagenesConservadas.length
                        ? imagenesConservadas
                        : [0],
                ]
            );
        }

        await cliente.query(
            `UPDATE imagen
             SET principal = FALSE
             WHERE id_producto = $1`,
            [idProducto]
        );

        for (
            let i = 0;
            i < imagenesNuevas.length;
            i += 1
        ) {
            const imagen = imagenesNuevas[i];

            await cliente.query(
                `INSERT INTO imagen
                    (id_producto, url, public_id, principal)
                 VALUES ($1, $2, $3, FALSE)`,
                [
                    idProducto,
                    imagen.url,
                    imagen.public_id,
                ]
            );
        }

        const imagenPrincipal =
            await cliente.query(
                `SELECT id_imagen
                 FROM imagen
                 WHERE id_producto = $1
                 ORDER BY id_imagen
                 LIMIT 1`,
                [idProducto]
            );

        await cliente.query(
            `UPDATE imagen
             SET principal = TRUE
             WHERE id_imagen = $1`,
            [imagenPrincipal.rows[0].id_imagen]
        );

        await cliente.query("COMMIT");

        return {
            producto: {
                ...producto,
                tipo: tipoActual,
                detalle,
                ocasiones: datos.ocasiones,
            },
            imagenesEliminadas,
        };
    } catch (error) {
        await cliente.query("ROLLBACK");
        throw error;
    } finally {
        cliente.release();
    }
}

async function darDeBajaProducto(pool, idProducto) {
    const cliente = await pool.connect();

    try {
        await cliente.query("BEGIN");

        const productoExistente = await cliente.query(
            `SELECT *
             FROM producto
             WHERE id_producto = $1
             FOR UPDATE`,
            [idProducto]
        );

        if (productoExistente.rowCount === 0) {
            const error = new Error(
                "Producto no encontrado."
            );
            error.status = 404;
            throw error;
        }

        if (!productoExistente.rows[0].activo) {
            const error = new Error(
                "El producto ya se encuentra dado de baja."
            );
            error.status = 400;
            throw error;
        }

        const {
            rows: [producto],
        } = await cliente.query(
            `UPDATE producto
             SET activo = FALSE
             WHERE id_producto = $1
             RETURNING *`,
            [idProducto]
        );

        await cliente.query("COMMIT");

        return producto;
    } catch (error) {
        await cliente.query("ROLLBACK");
        throw error;
    } finally {
        cliente.release();
    }
}

module.exports = {
    registrarProducto,
    obtenerProductoPorId,
    modificarProducto,
    darDeBajaProducto,
};