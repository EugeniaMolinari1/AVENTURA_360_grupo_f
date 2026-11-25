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

function calcularEstadoStock(producto) {
    if (
        producto.cantidad_variedades === 0 ||
        producto.variedades_con_stock === 0
    ) {
        return "sin_stock";
    }

    if (producto.variedades_stock_bajo > 0) {
        return "stock_bajo";
    }

    return "disponible";
}

function resumirProducto(producto) {
    return {
        id_producto: producto.id_producto,
        nombre: producto.nombre,
        marca: producto.marca,
        precio: producto.precio,
        imagen_principal:
            producto.imagen_principal,
        estado_stock:
            calcularEstadoStock(producto),
    };
}

async function obtenerCatalogo(pool) {
    const { rows } = await pool.query(
        `SELECT
            p.id_producto,
            p.nombre,
            p.marca,
            p.precio,
            i.url AS imagen_principal,
            COUNT(v.id_variedad)::INTEGER
                AS cantidad_variedades,
            COUNT(v.id_variedad) FILTER (
                WHERE v.stock > 0
            )::INTEGER AS variedades_con_stock,
            COUNT(v.id_variedad) FILTER (
                WHERE v.stock > 0
                  AND v.stock <= v.stock_minimo
            )::INTEGER AS variedades_stock_bajo
         FROM producto p
         LEFT JOIN imagen i
            ON i.id_producto = p.id_producto
           AND i.principal = TRUE
         LEFT JOIN variedad v
            ON v.id_producto = p.id_producto
         WHERE p.activo = TRUE
         GROUP BY
            p.id_producto,
            p.nombre,
            p.marca,
            p.precio,
            i.url
         ORDER BY p.id_producto`
    );

    return rows.map(resumirProducto);
}

function normalizarBusqueda(valor) {
    return String(valor ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

async function buscarProductos(pool, criterio) {
    const busqueda = normalizarBusqueda(criterio);

    if (!busqueda) {
        return obtenerCatalogo(pool);
    }

    const palabras = busqueda.split(" ");

    const { rows } = await pool.query(
        `SELECT
            p.id_producto,
            p.nombre,
            p.descripcion,
            p.marca,
            p.precio,
            i.url AS imagen_principal,

            CASE
                WHEN c.id_producto IS NOT NULL
                    THEN 'carpa'
                WHEN m.id_producto IS NOT NULL
                    THEN 'mochila'
                WHEN t.id_producto IS NOT NULL
                    THEN 'termo'
                WHEN a.id_producto IS NOT NULL
                    THEN 'accesorio'
                ELSE ''
            END AS tipo,

            COALESCE(
                (
                    SELECT string_agg(
                        DISTINCT o.nombre,
                        ' '
                    )
                    FROM producto_ocasion po
                    JOIN ocasion o
                        ON o.id_ocasion =
                           po.id_ocasion
                    WHERE po.id_producto =
                          p.id_producto
                ),
                ''
            ) AS ocasiones_texto,

            COALESCE(
                (
                    SELECT string_agg(
                        concat_ws(
                            ' ',
                            v2.color,
                            v2.medida,
                            v2.tamano_capacidad
                        ),
                        ' '
                    )
                    FROM variedad v2
                    WHERE v2.id_producto =
                          p.id_producto
                ),
                ''
            ) AS variedades_texto,

            COUNT(v.id_variedad)::INTEGER
                AS cantidad_variedades,

            COUNT(v.id_variedad) FILTER (
                WHERE v.stock > 0
            )::INTEGER
                AS variedades_con_stock,

            COUNT(v.id_variedad) FILTER (
                WHERE v.stock > 0
                  AND v.stock <= v.stock_minimo
            )::INTEGER
                AS variedades_stock_bajo

         FROM producto p

         LEFT JOIN imagen i
            ON i.id_producto = p.id_producto
           AND i.principal = TRUE

         LEFT JOIN variedad v
            ON v.id_producto = p.id_producto

         LEFT JOIN carpa c
            ON c.id_producto = p.id_producto

         LEFT JOIN mochila m
            ON m.id_producto = p.id_producto

         LEFT JOIN termo t
            ON t.id_producto = p.id_producto

         LEFT JOIN accesorio a
            ON a.id_producto = p.id_producto

         WHERE p.activo = TRUE

         GROUP BY
            p.id_producto,
            p.nombre,
            p.descripcion,
            p.marca,
            p.precio,
            i.url,
            c.id_producto,
            m.id_producto,
            t.id_producto,
            a.id_producto

         ORDER BY p.id_producto`
    );

    const resultados = rows
        .map((producto) => {
            const campos = [
                producto.nombre,
                producto.descripcion,
                producto.marca,
                producto.tipo,
                producto.ocasiones_texto,
                producto.variedades_texto,
            ].map(normalizarBusqueda);

            const textoCompleto =
                campos.join(" ");

            const coincidenciaExacta =
                campos.some(
                    (campo) =>
                        campo === busqueda
                );

            const palabrasCoincidentes =
                palabras.filter(
                    (palabra) =>
                        textoCompleto.includes(
                            palabra
                        )
                ).length;

            return {
                producto,
                coincidenciaExacta,
                palabrasCoincidentes,
            };
        })
        .filter(
            (resultado) =>
                resultado.coincidenciaExacta ||
                resultado.palabrasCoincidentes > 0
        )
        .sort((a, b) => {
            if (
                a.coincidenciaExacta !==
                b.coincidenciaExacta
            ) {
                return a.coincidenciaExacta
                    ? -1
                    : 1;
            }

            if (
                a.palabrasCoincidentes !==
                b.palabrasCoincidentes
            ) {
                return (
                    b.palabrasCoincidentes -
                    a.palabrasCoincidentes
                );
            }

            return (
                a.producto.id_producto -
                b.producto.id_producto
            );
        });

    return resultados.map(
        (resultado) =>
            resumirProducto(resultado.producto)
    );
}

async function obtenerDetalleProducto(pool, idProducto) {
    const cliente = await pool.connect();

    try {
        const {
            rows: [producto],
        } = await cliente.query(
            `SELECT
                id_producto,
                nombre,
                descripcion,
                marca,
                precio,
                dimensiones
             FROM producto
             WHERE id_producto = $1
               AND activo = TRUE`,
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

        const {
            rows: [detalle],
        } = await cliente.query(
            `SELECT *
             FROM ${tipo}
             WHERE id_producto = $1`,
            [idProducto]
        );

        const detalleLimpio = {
            ...detalle,
        };

        delete detalleLimpio.id_producto;

        const ocasiones = await cliente.query(
            `SELECT o.nombre
             FROM producto_ocasion po
             JOIN ocasion o
               ON o.id_ocasion = po.id_ocasion
             WHERE po.id_producto = $1
             ORDER BY o.id_ocasion`,
            [idProducto]
        );

        const imagenes = await cliente.query(
            `SELECT
                id_imagen,
                url,
                principal
             FROM imagen
             WHERE id_producto = $1
             ORDER BY principal DESC, id_imagen`,
            [idProducto]
        );

        const variedades = await cliente.query(
            `SELECT
                id_variedad,
                color,
                medida,
                tamano_capacidad,
                stock,
                stock_minimo
             FROM variedad
             WHERE id_producto = $1
             ORDER BY id_variedad`,
            [idProducto]
        );

        const variedadesPublicas =
            variedades.rows.map((variedad) => {
                let estadoStock = "disponible";

                if (variedad.stock === 0) {
                    estadoStock = "sin_stock";
                } else if (
                    variedad.stock <=
                    variedad.stock_minimo
                ) {
                    estadoStock = "stock_bajo";
                }

                return {
                    id_variedad:
                        variedad.id_variedad,
                    color: variedad.color,
                    medida: variedad.medida,
                    tamano_capacidad:
                        variedad.tamano_capacidad,
                    stock: variedad.stock,
                    estado_stock: estadoStock,
                };
            });

        return {
            ...producto,
            tipo,
            detalle: detalleLimpio,
            ocasiones: ocasiones.rows.map(
                (ocasion) => ocasion.nombre
            ),
            imagenes: imagenes.rows,
            variedades: variedadesPublicas,
        };
    } finally {
        cliente.release();
    }
}
module.exports = {
    registrarProducto,
    obtenerProductoPorId,
    modificarProducto,
    darDeBajaProducto,
    obtenerCatalogo,
    buscarProductos,
    obtenerDetalleProducto,
};
