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
    `hu02_test_${randomUUID().replaceAll("-", "")}`;

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
                `https://cloudinary.test/hu02-${contadorImagenes}.png`,
            public_id:
                `aventura360/hu02/imagen-${contadorImagenes}`,
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
    nombre,
    descripcion,
    marca,
    tipo = "carpa",
    ocasiones = [1],
}) {
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
        "150.00"
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
            capacidad_personas: 2,
            peso_kg: 2.5,
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
                    "imagen prueba"
                ),
            ],
            {
                type: "image/png",
            }
        ),
        "imagen.png"
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
        color,
        medida = null,
        tamano_capacidad = null,
        stock = 10,
        stock_minimo = 2,
    }
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

async function buscar(criterio) {
    const respuesta =
        await fetch(
            `${urlProductos}/buscar?q=${encodeURIComponent(criterio)
            }`
        );

    return {
        status: respuesta.status,
        body: await respuesta.json(),
    };
}

test(
    "GET buscar encuentra producto por nombre",
    async () => {
        const producto =
            await registrarProducto({
                nombre:
                    "Carpa Adventure",
                descripcion:
                    "Carpa para dos personas",
                marca:
                    "Aventura",
            });

        assert.equal(
            producto.status,
            201
        );

        const respuesta =
            await buscar(
                "Carpa Adventure"
            );

        assert.equal(
            respuesta.status,
            200
        );

        assert.ok(
            respuesta.body.productos
                .some(
                    (item) =>
                        item.id_producto ===
                        producto.body
                            .id_producto
                )
        );
    }
);

test(
    "GET buscar ignora mayusculas y minusculas",
    async () => {
        const respuesta =
            await buscar(
                "CARPA ADVENTURE"
            );

        assert.equal(
            respuesta.status,
            200
        );

        assert.ok(
            respuesta.body.productos
                .some(
                    (item) =>
                        item.nombre ===
                        "Carpa Adventure"
                )
        );
    }
);

test(
    "GET buscar ignora espacios sobrantes",
    async () => {
        const respuesta =
            await buscar(
                "   carpa    adventure   "
            );

        assert.equal(
            respuesta.status,
            200
        );

        assert.ok(
            respuesta.body.productos
                .some(
                    (item) =>
                        item.nombre ===
                        "Carpa Adventure"
                )
        );
    }
);

test(
    "GET buscar encuentra producto por descripcion",
    async () => {
        const producto =
            await registrarProducto({
                nombre:
                    "Refugio Andino",
                descripcion:
                    "Ideal para expediciones en montana",
                marca:
                    "Montana",
            });

        assert.equal(
            producto.status,
            201
        );

        const respuesta =
            await buscar(
                "expediciones"
            );

        assert.ok(
            respuesta.body.productos
                .some(
                    (item) =>
                        item.id_producto ===
                        producto.body
                            .id_producto
                )
        );
    }
);

test(
    "GET buscar encuentra producto por marca",
    async () => {
        const producto =
            await registrarProducto({
                nombre:
                    "Equipo Norte",
                descripcion:
                    "Producto de prueba",
                marca:
                    "PatagoniaTest",
            });

        const respuesta =
            await buscar(
                "PatagoniaTest"
            );

        assert.ok(
            respuesta.body.productos
                .some(
                    (item) =>
                        item.id_producto ===
                        producto.body
                            .id_producto
                )
        );
    }
);

test(
    "GET buscar encuentra producto por tipo",
    async () => {
        const producto =
            await registrarProducto({
                nombre:
                    "Equipo de viaje",
                descripcion:
                    "Para viajes largos",
                marca:
                    "Outdoor",
                tipo:
                    "mochila",
            });

        assert.equal(
            producto.status,
            201
        );

        const respuesta =
            await buscar(
                "mochila"
            );

        assert.ok(
            respuesta.body.productos
                .some(
                    (item) =>
                        item.id_producto ===
                        producto.body
                            .id_producto
                )
        );
    }
);

test(
    "GET buscar encuentra producto por ocasion",
    async () => {
        const producto =
            await registrarProducto({
                nombre:
                    "Equipo Sendero",
                descripcion:
                    "Producto especial",
                marca:
                    "Outdoor",
                ocasiones:
                    [2],
            });

        assert.equal(
            producto.status,
            201
        );

        const respuesta =
            await buscar(
                "trekking"
            );

        assert.ok(
            respuesta.body.productos
                .some(
                    (item) =>
                        item.id_producto ===
                        producto.body
                            .id_producto
                )
        );
    }
);

test(
    "GET buscar encuentra producto por color de variedad",
    async () => {
        const producto =
            await registrarProducto({
                nombre:
                    "Refugio Color",
                descripcion:
                    "Producto con variedad",
                marca:
                    "Outdoor",
            });

        const variedad =
            await registrarVariedad(
                producto.body.id_producto,
                {
                    color:
                        "Esmeralda",
                }
            );

        assert.equal(
            variedad.status,
            201
        );

        const respuesta =
            await buscar(
                "esmeralda"
            );

        assert.ok(
            respuesta.body.productos
                .some(
                    (item) =>
                        item.id_producto ===
                        producto.body
                            .id_producto
                )
        );
    }
);

test(
    "GET buscar encuentra producto por medida de variedad",
    async () => {
        const producto =
            await registrarProducto({
                nombre:
                    "Accesorio Medida",
                descripcion:
                    "Producto con medida",
                marca:
                    "Outdoor",
            });

        const variedad =
            await registrarVariedad(
                producto.body.id_producto,
                {
                    color: null,
                    medida: "XL",
                }
            );

        assert.equal(
            variedad.status,
            201
        );

        const respuesta =
            await buscar("xl");

        assert.ok(
            respuesta.body.productos
                .some(
                    (item) =>
                        item.id_producto ===
                        producto.body
                            .id_producto
                )
        );
    }
);

test(
    "GET buscar encuentra producto por tamano o capacidad de variedad",
    async () => {
        const producto =
            await registrarProducto({
                nombre:
                    "Equipo Capacidad",
                descripcion:
                    "Producto con capacidad",
                marca:
                    "Outdoor",
            });

        const variedad =
            await registrarVariedad(
                producto.body.id_producto,
                {
                    color: null,
                    tamano_capacidad:
                        "6 personas",
                }
            );

        assert.equal(
            variedad.status,
            201
        );

        const respuesta =
            await buscar(
                "6 personas"
            );

        assert.ok(
            respuesta.body.productos
                .some(
                    (item) =>
                        item.id_producto ===
                        producto.body
                            .id_producto
                )
        );
    }
);

test(
    "GET buscar prioriza producto que coincide con mas palabras",
    async () => {
        const verde =
            await registrarProducto({
                nombre:
                    "Carpa Verde Especial",
                descripcion:
                    "Carpa para camping",
                marca:
                    "Aventura",
            });

        const azul =
            await registrarProducto({
                nombre:
                    "Carpa Azul Especial",
                descripcion:
                    "Carpa para camping",
                marca:
                    "Aventura",
            });

        await registrarVariedad(
            verde.body.id_producto,
            {
                color: "Verde",
            }
        );

        await registrarVariedad(
            azul.body.id_producto,
            {
                color: "Azul",
            }
        );

        const respuesta =
            await buscar(
                "carpa verde"
            );

        assert.equal(
            respuesta.status,
            200
        );

        const indiceVerde =
            respuesta.body.productos
                .findIndex(
                    (item) =>
                        item.id_producto ===
                        verde.body.id_producto
                );

        const indiceAzul =
            respuesta.body.productos
                .findIndex(
                    (item) =>
                        item.id_producto ===
                        azul.body.id_producto
                );

        assert.ok(
            indiceVerde !== -1
        );

        assert.ok(
            indiceAzul !== -1
        );

        assert.ok(
            indiceVerde < indiceAzul
        );
    }
);

test(
    "GET buscar no muestra productos dados de baja",
    async () => {
        const producto =
            await registrarProducto({
                nombre:
                    "Producto Oculto Unico",
                descripcion:
                    "Producto para dar de baja",
                marca:
                    "MarcaOculta",
            });

        const baja =
            await fetch(
                `${urlProductos}/${producto.body.id_producto
                }`,
                {
                    method: "DELETE",
                }
            );

        assert.equal(
            baja.status,
            200
        );

        const respuesta =
            await buscar(
                "MarcaOculta"
            );

        assert.equal(
            respuesta.body.productos
                .some(
                    (item) =>
                        item.id_producto ===
                        producto.body
                            .id_producto
                ),
            false
        );
    }
);

test(
    "GET buscar muestra productos sin stock con aviso",
    async () => {
        const producto =
            await registrarProducto({
                nombre:
                    "Producto SinStockBusqueda",
                descripcion:
                    "Producto sin unidades",
                marca:
                    "Outdoor",
            });

        await registrarVariedad(
            producto.body.id_producto,
            {
                color: "Negro",
                stock: 0,
                stock_minimo: 2,
            }
        );

        const respuesta =
            await buscar(
                "SinStockBusqueda"
            );

        const encontrado =
            respuesta.body.productos
                .find(
                    (item) =>
                        item.id_producto ===
                        producto.body
                            .id_producto
                );

        assert.ok(encontrado);

        assert.equal(
            encontrado.estado_stock,
            "sin_stock"
        );
    }
);

test(
    "GET buscar muestra productos con stock bajo",
    async () => {
        const producto =
            await registrarProducto({
                nombre:
                    "Producto StockBajoBusqueda",
                descripcion:
                    "Producto con pocas unidades",
                marca:
                    "Outdoor",
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
            await buscar(
                "StockBajoBusqueda"
            );

        const encontrado =
            respuesta.body.productos
                .find(
                    (item) =>
                        item.id_producto ===
                        producto.body
                            .id_producto
                );

        assert.ok(encontrado);

        assert.equal(
            encontrado.estado_stock,
            "stock_bajo"
        );
    }
);

test(
    "GET buscar devuelve mensaje cuando no hay resultados relacionados",
    async () => {
        const respuesta =
            await buscar(
                "zzzzproductoquenoexiste999"
            );

        assert.equal(
            respuesta.status,
            200
        );

        assert.deepEqual(
            respuesta.body.productos,
            []
        );

        assert.equal(
            respuesta.body.mensaje,
            "No encontramos productos relacionados con tu busqueda. Proba con otras palabras."
        );
    }
);

test(
    "GET buscar sin criterio devuelve el catalogo",
    async () => {
        const respuesta =
            await buscar("");

        assert.equal(
            respuesta.status,
            200
        );

        assert.ok(
            Array.isArray(
                respuesta.body.productos
            )
        );

        assert.ok(
            respuesta.body.productos
                .length > 0
        );
    }
);