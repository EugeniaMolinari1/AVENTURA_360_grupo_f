require("dotenv").config();

const {
    test,
    before,
    after,
} = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const { crearApp } = require("../src/app");

const esquema =
    `hu05_test_${randomUUID().replaceAll("-", "")}`;

const config = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
};

let admin;
let pool;
let servidor;
let urlProductos;
let urlVariedades;
let contadorImagenes = 0;

const servicioImagenesFalso = {
    async subirImagen() {
        contadorImagenes += 1;

        return {
            url:
                `https://cloudinary.test/hu05-${contadorImagenes}.png`,
            public_id:
                `aventura360/hu05/imagen-${contadorImagenes}`,
        };
    },

    async eliminarImagen() {
        return undefined;
    },
};

before(async () => {
    admin = new Pool(config);

    await admin.query(
        `CREATE SCHEMA ${esquema}`
    );

    pool = new Pool({
        ...config,
        options: `-c search_path=${esquema}`,
        max: 1,
    });

    await pool.query(
        readFileSync(
            join(
                __dirname,
                "../src/db/sql/001_hu19_productos.sql"
            ),
            "utf8"
        )
    );

    await pool.query(
        readFileSync(
            join(
                __dirname,
                "../src/db/sql/002_hu26_variedades.sql"
            ),
            "utf8"
        )
    );

    servidor = crearApp(
        pool,
        servicioImagenesFalso
    ).listen(0, "127.0.0.1");

    await new Promise((resolve) =>
        servidor.once(
            "listening",
            resolve
        )
    );

    const base =
        `http://127.0.0.1:${servidor.address().port}/api`;

    urlProductos =
        `${base}/productos`;

    urlVariedades =
        `${base}/variedades`;
});

after(async () => {
    if (servidor) {
        await new Promise(
            (resolve, reject) =>
                servidor.close(
                    (error) =>
                        error
                            ? reject(error)
                            : resolve()
                )
        );
    }

    if (pool) {
        await pool.end();
    }

    if (admin) {
        try {
            await admin.query(
                `DROP SCHEMA IF EXISTS ${esquema} CASCADE`
            );
        } finally {
            await admin.end();
        }
    }
});

async function registrarProducto({
    nombre = "Carpa Detalle",
    descripcion = "Carpa para prueba de detalle",
    marca = "Aventura",
    tipo = "carpa",
    ocasiones = [1, 2],
} = {}) {
    const form = new FormData();

    form.append(
        "nombre",
        nombre
    );

    form.append(
        "descripcion",
        descripcion
    );

    form.append(
        "marca",
        marca
    );

    form.append(
        "precio",
        "150000.00"
    );

    form.append(
        "dimensiones",
        "200 x 150 cm"
    );

    form.append(
        "tipo",
        tipo
    );

    let detalle;

    if (tipo === "carpa") {
        detalle = {
            capacidad_personas: 4,
            peso_kg: 3.5,
        };
    } else if (tipo === "mochila") {
        detalle = {
            capacidad_litros: 40,
        };
    } else if (tipo === "termo") {
        detalle = {
            capacidad_ml: 1000,
            termico: true,
        };
    } else {
        detalle = {
            tipo_accesorio: "linterna",
        };
    }

    form.append(
        "detalle",
        JSON.stringify(detalle)
    );

    form.append(
        "ocasiones",
        JSON.stringify(ocasiones)
    );

    form.append(
        "imagenes",
        new Blob(
            [
                Buffer.from(
                    "imagen principal"
                ),
            ],
            {
                type: "image/png",
            }
        ),
        "principal.png"
    );

    form.append(
        "imagenes",
        new Blob(
            [
                Buffer.from(
                    "imagen secundaria"
                ),
            ],
            {
                type: "image/png",
            }
        ),
        "secundaria.png"
    );

    const respuesta =
        await fetch(
            urlProductos,
            {
                method: "POST",
                body: form,
            }
        );

    return {
        status: respuesta.status,
        body: await respuesta.json(),
    };
}

async function registrarVariedad(
    idProducto,
    {
        color = null,
        medida = null,
        tamano_capacidad = null,
        stock = 10,
        stock_minimo = 2,
    } = {}
) {
    const respuesta =
        await fetch(
            urlVariedades,
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json",
                },
                body: JSON.stringify({
                    id_producto:
                        idProducto,
                    color,
                    medida,
                    tamano_capacidad,
                    stock,
                    stock_minimo,
                }),
            }
        );

    return {
        status: respuesta.status,
        body: await respuesta.json(),
    };
}

async function obtenerDetalle(idProducto) {
    const respuesta =
        await fetch(
            `${urlProductos}/${idProducto}/detalle`
        );

    return {
        status: respuesta.status,
        body: await respuesta.json(),
    };
}

test(
    "GET detalle devuelve informacion completa del producto activo",
    async () => {
        const producto =
            await registrarProducto();

        assert.equal(
            producto.status,
            201
        );

        const respuesta =
            await obtenerDetalle(
                producto.body.id_producto
            );

        assert.equal(
            respuesta.status,
            200
        );

        assert.equal(
            respuesta.body.id_producto,
            producto.body.id_producto
        );

        assert.equal(
            respuesta.body.nombre,
            "Carpa Detalle"
        );

        assert.equal(
            respuesta.body.descripcion,
            "Carpa para prueba de detalle"
        );

        assert.equal(
            respuesta.body.marca,
            "Aventura"
        );

        assert.equal(
            respuesta.body.precio,
            "150000.00"
        );

        assert.equal(
            respuesta.body.dimensiones,
            "200 x 150 cm"
        );
    }
);

test(
    "GET detalle devuelve tipo y caracteristicas propias del producto",
    async () => {
        const producto =
            await registrarProducto({
                nombre: "Mochila Detalle",
                tipo: "mochila",
                ocasiones: [2],
            });

        const respuesta =
            await obtenerDetalle(
                producto.body.id_producto
            );

        assert.equal(
            respuesta.status,
            200
        );

        assert.equal(
            respuesta.body.tipo,
            "mochila"
        );

        assert.equal(
            respuesta.body.detalle
                .capacidad_litros,
            40
        );

        assert.equal(
            Object.hasOwn(
                respuesta.body.detalle,
                "id_producto"
            ),
            false
        );
    }
);

test(
    "GET detalle devuelve todas las imagenes sin public_id",
    async () => {
        const producto =
            await registrarProducto({
                nombre: "Producto Imagenes",
            });

        const respuesta =
            await obtenerDetalle(
                producto.body.id_producto
            );

        assert.equal(
            respuesta.status,
            200
        );

        assert.equal(
            respuesta.body.imagenes.length,
            2
        );

        assert.equal(
            respuesta.body.imagenes[0]
                .principal,
            true
        );

        for (
            const imagen
            of respuesta.body.imagenes
        ) {
            assert.ok(
                imagen.id_imagen
            );

            assert.ok(
                imagen.url
            );

            assert.equal(
                Object.hasOwn(
                    imagen,
                    "public_id"
                ),
                false
            );
        }
    }
);

test(
    "GET detalle devuelve ocasiones por nombre",
    async () => {
        const producto =
            await registrarProducto({
                nombre: "Producto Ocasiones",
                ocasiones: [1, 2],
            });

        const respuesta =
            await obtenerDetalle(
                producto.body.id_producto
            );

        assert.equal(
            respuesta.status,
            200
        );

        assert.ok(
            respuesta.body.ocasiones
                .includes("camping")
        );

        assert.ok(
            respuesta.body.ocasiones
                .includes("trekking")
        );

        assert.equal(
            respuesta.body.ocasiones
                .every(
                    (ocasion) =>
                        typeof ocasion ===
                        "string"
                ),
            true
        );
    }
);

test(
    "GET detalle devuelve todas las variedades con stock exacto",
    async () => {
        const producto =
            await registrarProducto({
                nombre: "Producto Variedades",
            });

        await registrarVariedad(
            producto.body.id_producto,
            {
                color: "Verde",
                medida: "M",
                tamano_capacidad:
                    "4 personas",
                stock: 10,
                stock_minimo: 2,
            }
        );

        await registrarVariedad(
            producto.body.id_producto,
            {
                color: "Azul",
                medida: "L",
                tamano_capacidad:
                    "6 personas",
                stock: 7,
                stock_minimo: 2,
            }
        );

        const respuesta =
            await obtenerDetalle(
                producto.body.id_producto
            );

        assert.equal(
            respuesta.status,
            200
        );

        assert.equal(
            respuesta.body.variedades.length,
            2
        );

        const verde =
            respuesta.body.variedades
                .find(
                    (variedad) =>
                        variedad.color ===
                        "Verde"
                );

        assert.ok(verde);

        assert.equal(
            verde.medida,
            "M"
        );

        assert.equal(
            verde.tamano_capacidad,
            "4 personas"
        );

        assert.equal(
            verde.stock,
            10
        );
    }
);

test(
    "GET detalle no expone stock_minimo",
    async () => {
        const producto =
            await registrarProducto({
                nombre:
                    "Producto Stock Minimo",
            });

        await registrarVariedad(
            producto.body.id_producto,
            {
                color: "Negro",
                stock: 10,
                stock_minimo: 5,
            }
        );

        const respuesta =
            await obtenerDetalle(
                producto.body.id_producto
            );

        assert.equal(
            respuesta.status,
            200
        );

        assert.equal(
            Object.hasOwn(
                respuesta.body.variedades[0],
                "stock_minimo"
            ),
            false
        );
    }
);

test(
    "GET detalle indica variedad disponible",
    async () => {
        const producto =
            await registrarProducto({
                nombre:
                    "Producto Disponible",
            });

        await registrarVariedad(
            producto.body.id_producto,
            {
                color: "Verde",
                stock: 10,
                stock_minimo: 2,
            }
        );

        const respuesta =
            await obtenerDetalle(
                producto.body.id_producto
            );

        assert.equal(
            respuesta.body.variedades[0]
                .estado_stock,
            "disponible"
        );
    }
);

test(
    "GET detalle indica variedad con stock bajo",
    async () => {
        const producto =
            await registrarProducto({
                nombre:
                    "Producto Stock Bajo",
            });

        await registrarVariedad(
            producto.body.id_producto,
            {
                color: "Gris",
                stock: 2,
                stock_minimo: 2,
            }
        );

        const respuesta =
            await obtenerDetalle(
                producto.body.id_producto
            );

        assert.equal(
            respuesta.body.variedades[0]
                .estado_stock,
            "stock_bajo"
        );
    }
);

test(
    "GET detalle indica variedad sin stock",
    async () => {
        const producto =
            await registrarProducto({
                nombre:
                    "Producto Sin Stock",
            });

        await registrarVariedad(
            producto.body.id_producto,
            {
                color: "Rojo",
                stock: 0,
                stock_minimo: 2,
            }
        );

        const respuesta =
            await obtenerDetalle(
                producto.body.id_producto
            );

        assert.equal(
            respuesta.body.variedades[0]
                .stock,
            0
        );

        assert.equal(
            respuesta.body.variedades[0]
                .estado_stock,
            "sin_stock"
        );
    }
);

test(
    "GET detalle devuelve arreglo vacio si el producto no tiene variedades",
    async () => {
        const producto =
            await registrarProducto({
                nombre:
                    "Producto Sin Variedades",
            });

        const respuesta =
            await obtenerDetalle(
                producto.body.id_producto
            );

        assert.equal(
            respuesta.status,
            200
        );

        assert.deepEqual(
            respuesta.body.variedades,
            []
        );
    }
);

test(
    "GET detalle no permite consultar producto dado de baja",
    async () => {
        const producto =
            await registrarProducto({
                nombre:
                    "Producto Inactivo Detalle",
            });

        const baja =
            await fetch(
                `${urlProductos}/${producto.body.id_producto}`,
                {
                    method: "DELETE",
                }
            );

        assert.equal(
            baja.status,
            200
        );

        const respuesta =
            await obtenerDetalle(
                producto.body.id_producto
            );

        assert.equal(
            respuesta.status,
            404
        );

        assert.equal(
            respuesta.body.error,
            "Producto no encontrado o no disponible."
        );
    }
);

test(
    "GET detalle devuelve 404 para producto inexistente",
    async () => {
        const respuesta =
            await obtenerDetalle(
                2147483647
            );

        assert.equal(
            respuesta.status,
            404
        );

        assert.equal(
            respuesta.body.error,
            "Producto no encontrado o no disponible."
        );
    }
);

test(
    "GET detalle devuelve 400 para identificador invalido",
    async () => {
        const respuesta =
            await obtenerDetalle(
                "abc"
            );

        assert.equal(
            respuesta.status,
            400
        );

        assert.deepEqual(
            respuesta.body.errores,
            [
                "El identificador del producto no es valido.",
            ]
        );
    }
);

test(
    "GET detalle es accesible sin iniciar sesion",
    async () => {
        const producto =
            await registrarProducto({
                nombre:
                    "Producto Publico Detalle",
            });

        const respuesta =
            await fetch(
                `${urlProductos}/${producto.body.id_producto}/detalle`
            );

        assert.equal(
            respuesta.status,
            200
        );

        const body =
            await respuesta.json();

        assert.equal(
            body.nombre,
            "Producto Publico Detalle"
        );
    }
);
