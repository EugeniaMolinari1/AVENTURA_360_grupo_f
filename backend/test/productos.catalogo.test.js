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
    `hu01_test_${randomUUID().replaceAll("-", "")}`;

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
                `https://cloudinary.test/hu01-${contadorImagenes}.png`,
            public_id:
                `aventura360/hu01/imagen-${contadorImagenes}`,
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

async function registrarProducto(nombre) {
    const form = new FormData();

    form.append(
        "nombre",
        nombre
    );

    form.append(
        "descripcion",
        "Producto para prueba de catalogo"
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
                        datos.medida ?? null,
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
    "GET catalogo muestra productos activos con stock disponible",
    async () => {
        const producto =
            await registrarProducto(
                "Carpa con stock"
            );

        assert.equal(
            producto.status,
            201
        );

        const variedad =
            await registrarVariedad(
                producto.body.id_producto,
                {
                    color: "Verde",
                    stock: 10,
                    stock_minimo: 2,
                }
            );

        assert.equal(
            variedad.status,
            201
        );

        const respuesta =
            await fetch(urlProductos);

        const body =
            await respuesta.json();

        assert.equal(
            respuesta.status,
            200
        );

        const encontrado =
            body.find(
                (item) =>
                    item.id_producto ===
                    producto.body.id_producto
            );

        assert.ok(encontrado);

        assert.equal(
            encontrado.estado_stock,
            "disponible"
        );

        assert.equal(
            encontrado.nombre,
            "Carpa con stock"
        );

        assert.ok(
            encontrado.imagen_principal
        );
    }
);

test(
    "GET catalogo indica stock bajo",
    async () => {
        const producto =
            await registrarProducto(
                "Carpa stock bajo"
            );

        assert.equal(
            producto.status,
            201
        );

        const variedad =
            await registrarVariedad(
                producto.body.id_producto,
                {
                    color: "Azul",
                    stock: 2,
                    stock_minimo: 2,
                }
            );

        assert.equal(
            variedad.status,
            201
        );

        const respuesta =
            await fetch(urlProductos);

        const body =
            await respuesta.json();

        const encontrado =
            body.find(
                (item) =>
                    item.id_producto ===
                    producto.body.id_producto
            );

        assert.ok(encontrado);

        assert.equal(
            encontrado.estado_stock,
            "stock_bajo"
        );
    }
);

test(
    "GET catalogo indica sin stock cuando todas las variedades tienen stock cero",
    async () => {
        const producto =
            await registrarProducto(
                "Carpa sin stock"
            );

        assert.equal(
            producto.status,
            201
        );

        const variedad =
            await registrarVariedad(
                producto.body.id_producto,
                {
                    color: "Negro",
                    stock: 0,
                    stock_minimo: 2,
                }
            );

        assert.equal(
            variedad.status,
            201
        );

        const respuesta =
            await fetch(urlProductos);

        const body =
            await respuesta.json();

        const encontrado =
            body.find(
                (item) =>
                    item.id_producto ===
                    producto.body.id_producto
            );

        assert.ok(encontrado);

        assert.equal(
            encontrado.estado_stock,
            "sin_stock"
        );
    }
);

test(
    "GET catalogo indica sin stock cuando el producto no tiene variedades",
    async () => {
        const producto =
            await registrarProducto(
                "Carpa sin variedades"
            );

        assert.equal(
            producto.status,
            201
        );

        const respuesta =
            await fetch(urlProductos);

        const body =
            await respuesta.json();

        const encontrado =
            body.find(
                (item) =>
                    item.id_producto ===
                    producto.body.id_producto
            );

        assert.ok(encontrado);

        assert.equal(
            encontrado.estado_stock,
            "sin_stock"
        );
    }
);

test(
    "GET catalogo no muestra productos dados de baja",
    async () => {
        const producto =
            await registrarProducto(
                "Carpa dada de baja"
            );

        assert.equal(
            producto.status,
            201
        );

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
            await fetch(urlProductos);

        const body =
            await respuesta.json();

        const encontrado =
            body.find(
                (item) =>
                    item.id_producto ===
                    producto.body.id_producto
            );

        assert.equal(
            encontrado,
            undefined
        );
    }
);

test(
    "GET catalogo devuelve una lista aunque no haya productos visibles",
    async () => {
        await pool.query(
            `UPDATE producto
             SET activo = FALSE`
        );

        const respuesta =
            await fetch(urlProductos);

        const body =
            await respuesta.json();

        assert.equal(
            respuesta.status,
            200
        );

        assert.ok(
            Array.isArray(body)
        );

        assert.deepEqual(
            body,
            []
        );
    }
);
