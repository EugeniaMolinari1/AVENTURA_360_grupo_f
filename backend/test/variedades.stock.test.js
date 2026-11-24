require("dotenv").config();

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const { crearApp } = require("../src/app");

const esquema =
    `hu22_test_${randomUUID().replaceAll("-", "")}`;

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
                `https://cloudinary.test/hu22-${contadorImagenes}.png`,
            public_id:
                `aventura360/hu22/imagen-${contadorImagenes}`,
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

async function registrarProducto() {
    const form = new FormData();

    form.append(
        "nombre",
        "Carpa para consultar stock"
    );

    form.append(
        "descripcion",
        "Producto de prueba HU-22"
    );

    form.append(
        "marca",
        "Marca prueba"
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
        "carpa"
    );

    form.append(
        "detalle",
        JSON.stringify({
            capacidad_personas: 2,
            peso_kg: 2.5,
        })
    );

    form.append(
        "ocasiones",
        JSON.stringify([1, 2])
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
        body:
            await respuesta.json(),
    };
}

async function registrarVariedad(
    idProducto,
    datos
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
                    color:
                        datos.color,
                    medida:
                        datos.medida ??
                        null,
                    tamano_capacidad:
                        datos.tamano_capacidad ??
                        null,
                    stock:
                        datos.stock,
                    stock_minimo:
                        datos.stock_minimo,
                }),
            }
        );

    return {
        status: respuesta.status,
        body:
            await respuesta.json(),
    };
}

test(
    "GET muestra el stock individual de cada variedad del producto",
    async () => {
        const producto =
            await registrarProducto();

        assert.equal(
            producto.status,
            201
        );

        const idProducto =
            producto.body.id_producto;

        const variedadVerde =
            await registrarVariedad(
                idProducto,
                {
                    color: "Verde",
                    tamano_capacidad:
                        "4 personas",
                    stock: 8,
                    stock_minimo: 2,
                }
            );

        const variedadNegra =
            await registrarVariedad(
                idProducto,
                {
                    color: "Negro",
                    tamano_capacidad:
                        "4 personas",
                    stock: 0,
                    stock_minimo: 2,
                }
            );

        assert.equal(
            variedadVerde.status,
            201
        );

        assert.equal(
            variedadNegra.status,
            201
        );

        const respuesta =
            await fetch(
                `${urlVariedades}/producto/${idProducto}/stock`
            );

        const body =
            await respuesta.json();

        assert.equal(
            respuesta.status,
            200
        );

        assert.equal(
            body.id_producto,
            idProducto
        );

        assert.equal(
            body.nombre,
            "Carpa para consultar stock"
        );

        assert.equal(
            body.variedades.length,
            2
        );

        assert.equal(
            body.variedades[0]
                .id_variedad,
            variedadVerde.body
                .id_variedad
        );

        assert.equal(
            body.variedades[0].stock,
            8
        );

        assert.equal(
            body.variedades[1]
                .id_variedad,
            variedadNegra.body
                .id_variedad
        );

        assert.equal(
            body.variedades[1].stock,
            0
        );
    }
);

test(
    "GET permite consultar un producto con una sola variedad",
    async () => {
        const producto =
            await registrarProducto();

        assert.equal(
            producto.status,
            201
        );

        const idProducto =
            producto.body.id_producto;

        const variedad =
            await registrarVariedad(
                idProducto,
                {
                    color: "Azul",
                    medida: "M",
                    stock: 5,
                    stock_minimo: 1,
                }
            );

        assert.equal(
            variedad.status,
            201
        );

        const respuesta =
            await fetch(
                `${urlVariedades}/producto/${idProducto}/stock`
            );

        const body =
            await respuesta.json();

        assert.equal(
            respuesta.status,
            200
        );

        assert.equal(
            body.variedades.length,
            1
        );

        assert.equal(
            body.variedades[0].stock,
            5
        );
    }
);

test(
    "GET devuelve lista vacia si el producto no tiene variedades",
    async () => {
        const producto =
            await registrarProducto();

        assert.equal(
            producto.status,
            201
        );

        const respuesta =
            await fetch(
                `${urlVariedades}/producto/${producto.body.id_producto}/stock`
            );

        const body =
            await respuesta.json();

        assert.equal(
            respuesta.status,
            200
        );

        assert.deepEqual(
            body.variedades,
            []
        );
    }
);

test(
    "GET rechaza producto inexistente",
    async () => {
        const respuesta =
            await fetch(
                `${urlVariedades}/producto/999999/stock`
            );

        const body =
            await respuesta.json();

        assert.equal(
            respuesta.status,
            404
        );

        assert.ok(
            body.errores.includes(
                "El producto indicado no existe."
            )
        );
    }
);

test(
    "GET rechaza identificador de producto invalido",
    async () => {
        const respuesta =
            await fetch(
                `${urlVariedades}/producto/abc/stock`
            );

        const body =
            await respuesta.json();

        assert.equal(
            respuesta.status,
            400
        );

        assert.ok(
            body.errores.includes(
                "El identificador del producto no es valido."
            )
        );
    }
);