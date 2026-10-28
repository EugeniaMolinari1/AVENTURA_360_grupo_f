require("dotenv").config();

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const { crearApp } = require("../src/app");
const {
    validarProducto,
} = require("../src/validators/productos.validator");

const detalles = {
    carpa: {
        capacidad_personas: 2,
        peso_kg: 1.5,
    },
    mochila: {
        capacidad_litros: 30,
    },
    termo: {
        capacidad_ml: 500,
        termico: false,
    },
    accesorio: {
        tipo_accesorio: "Linterna",
    },
};

const producto = (tipo = "carpa") => ({
    nombre: "Producto de prueba",
    descripcion: "Descripcion",
    marca: "Marca",
    precio: "123.45",
    dimensiones: "20 x 30",
    tipo,
    detalle: { ...detalles[tipo] },
    ocasiones: [1, 2],
});

test("validaciones de tipos, campos obligatorios y precision", () => {
    for (const tipo of Object.keys(detalles)) {
        assert.deepEqual(validarProducto(producto(tipo)), []);
    }

    const invalidos = [
        null,
        [],
        "texto",
        {},
        ...["nombre", "descripcion", "marca", "dimensiones"].flatMap(
            (campo) =>
                [null, "", "   ", 5].map((valor) => ({
                    ...producto(),
                    [campo]: valor,
                }))
        ),
        ...[
            0,
            -1,
            "0.00",
            1.234,
            "1.001",
            "NaN",
            Infinity,
            true,
            null,
            "1e2",
            "12.34500000000000000001",
        ].map((precio) => ({
            ...producto(),
            precio,
        })),
        ...[
            [],
            [1, 1],
            [0],
            [-1],
            [1.5],
            ["1"],
            [2147483648],
            null,
        ].map((ocasiones) => ({
            ...producto(),
            ocasiones,
        })),
        ...[
            "otro",
            "__proto__",
            ["carpa", "mochila"],
            null,
            { toString: null },
        ].map((tipo) => ({
            ...producto(),
            tipo,
        })),
        ...[
            null,
            [],
            {},
            {
                ...detalles.carpa,
                capacidad_litros: 20,
            },
            {
                capacidad_personas: 0,
                peso_kg: 1,
            },
            {
                capacidad_personas: 1.5,
                peso_kg: 1,
            },
            {
                capacidad_personas: 2147483648,
                peso_kg: 1,
            },
            {
                capacidad_personas: 2,
                peso_kg: Infinity,
            },
            {
                capacidad_personas: 2,
                peso_kg: 0,
            },
            {
                capacidad_personas: 2,
                peso_kg: "1",
            },
        ].map((detalle) => ({
            ...producto(),
            detalle,
        })),
        {
            ...producto("mochila"),
            detalle: {
                capacidad_litros: -1,
            },
        },
        {
            ...producto("termo"),
            detalle: {
                capacidad_ml: 0,
                termico: true,
            },
        },
        {
            ...producto("termo"),
            detalle: {
                capacidad_ml: 500,
                termico: "false",
            },
        },
        {
            ...producto("accesorio"),
            detalle: {
                tipo_accesorio: " ",
            },
        },
        ...[
            "activo",
            "id_producto",
            "stock",
            "imagenes",
            "sku",
        ].map((campo) => ({
            ...producto(),
            [campo]: true,
        })),
    ];

    for (const datos of invalidos) {
        assert.ok(
            validarProducto(datos).length,
            JSON.stringify(datos)
        );
    }

    for (const precio of [
        1,
        1.25,
        "0.01",
        "999999999999999999999.99",
    ]) {
        assert.deepEqual(
            validarProducto({
                ...producto(),
                precio,
            }),
            []
        );
    }
});

const esquema =
    `hu19_test_${randomUUID().replaceAll("-", "")}`;

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
let url;

let contadorImagenes = 0;
const imagenesEliminadas = [];

const servicioImagenesFalso = {
    async subirImagen() {
        contadorImagenes += 1;

        return {
            url: `https://cloudinary.test/imagen-${contadorImagenes}.png`,
            public_id: `aventura360/test/imagen-${contadorImagenes}`,
        };
    },

    async eliminarImagen(publicId) {
        imagenesEliminadas.push(publicId);
    },
};

before(async () => {
    admin = new Pool(config);

    await admin.query(`CREATE SCHEMA ${esquema}`);

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

    servidor = crearApp(
        pool,
        servicioImagenesFalso
    ).listen(0, "127.0.0.1");

    await new Promise((resolve) =>
        servidor.once("listening", resolve)
    );

    url =
        `http://127.0.0.1:${servidor.address().port}/api/productos`;
});

after(async () => {
    if (servidor) {
        await new Promise((resolve, reject) =>
            servidor.close((error) =>
                error ? reject(error) : resolve()
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

async function post(datos, incluirImagen = true) {
    const form = new FormData();

    if (
        datos !== null &&
        typeof datos === "object" &&
        !Array.isArray(datos)
    ) {
        for (const [campo, valor] of Object.entries(datos)) {
            if (campo === "detalle" || campo === "ocasiones") {
                form.append(campo, JSON.stringify(valor));
            } else {
                form.append(campo, String(valor));
            }
        }
    }

    if (incluirImagen) {
        form.append(
            "imagenes",
            new Blob(
                [Buffer.from("imagen de prueba")],
                { type: "image/png" }
            ),
            "prueba.png"
        );
    }

    const respuesta = await fetch(url, {
        method: "POST",
        body: form,
    });

    return {
        status: respuesta.status,
        body: await respuesta.json(),
    };
}

for (const tipo of Object.keys(detalles)) {
    test(`POST registra ${tipo} y sus ocasiones`, async () => {
        const { status, body } =
            await post(producto(tipo));

        assert.equal(status, 201);
        assert.equal(body.activo, true);
        assert.equal(body.precio, "123.45");
        assert.equal(body.tipo, tipo);

        for (
            const [campo, valor]
            of Object.entries(detalles[tipo])
        ) {
            assert.equal(
                body.detalle[campo],
                campo === "peso_kg"
                    ? String(valor)
                    : valor
            );
        }

        const { rows } = await pool.query(
            `SELECT * FROM ${tipo}
             WHERE id_producto = $1`,
            [body.id_producto]
        );

        assert.equal(rows.length, 1);

        const relaciones = await pool.query(
            `SELECT id_ocasion
             FROM producto_ocasion
             WHERE id_producto = $1
             ORDER BY id_ocasion`,
            [body.id_producto]
        );

        assert.deepEqual(
            relaciones.rows.map(
                (row) => row.id_ocasion
            ),
            [1, 2]
        );

        const imagenes = await pool.query(
            `SELECT url, public_id, principal
             FROM imagen
             WHERE id_producto = $1`,
            [body.id_producto]
        );

        assert.equal(imagenes.rows.length, 1);
        assert.equal(
            imagenes.rows[0].principal,
            true
        );
        assert.ok(imagenes.rows[0].url);
        assert.ok(imagenes.rows[0].public_id);

        const todos = await pool.query(
            `SELECT
                (SELECT count(*) FROM carpa
                 WHERE id_producto=$1)
                + (SELECT count(*) FROM mochila
                 WHERE id_producto=$1)
                + (SELECT count(*) FROM termo
                 WHERE id_producto=$1)
                + (SELECT count(*) FROM accesorio
                 WHERE id_producto=$1)
                AS cantidad`,
            [body.id_producto]
        );

        assert.equal(
            todos.rows[0].cantidad,
            "1"
        );
    });
}

test(
    "HTTP rechaza datos invalidos, ocasiones inexistentes y falta de imagen",
    async () => {
        const antes = await pool.query(
            "SELECT count(*) FROM producto"
        );

        const casosInvalidos = [
            {},
            {
                ...producto(),
                precio: "1.234",
            },
            {
                ...producto(),
                ocasiones: [],
            },
            {
                ...producto(),
                ocasiones: [1, 99999],
            },
            {
                ...producto(),
                activo: false,
            },
        ];

        for (const datos of casosInvalidos) {
            const respuesta = await post(datos);

            assert.equal(respuesta.status, 400);
            assert.ok(
                respuesta.body.errores.length
            );
        }

        const sinImagen = await post(
            producto(),
            false
        );

        assert.equal(sinImagen.status, 400);
        assert.ok(
            sinImagen.body.errores.includes(
                "Debe ingresar al menos una imagen."
            )
        );

        assert.deepEqual(
            (
                await pool.query(
                    "SELECT count(*) FROM producto"
                )
            ).rows,
            antes.rows
        );
    }
);

test(
    "rollback real ante fallos de subtipo y asociaciones; cliente reutilizable",
    async () => {
        const contar = async () =>
            (
                await pool.query(
                    `SELECT
                        (SELECT count(*) FROM producto)
                            AS productos,
                        (SELECT count(*) FROM carpa)
                            AS carpas,
                        (SELECT count(*) FROM producto_ocasion)
                            AS relaciones,
                        (SELECT count(*) FROM imagen)
                            AS imagenes`
                )
            ).rows;

        const antes = await contar();

        const escenarios = [
            [
                "carpa",
                "CHECK (capacidad_personas <> 2)",
            ],
            [
                "producto_ocasion",
                "CHECK (id_ocasion <> 2)",
            ],
        ];

        for (const [tabla, check] of escenarios) {
            await pool.query(
                `ALTER TABLE ${tabla}
                 ADD CONSTRAINT fallo_prueba
                 ${check} NOT VALID`
            );

            try {
                const respuesta =
                    await post(producto());

                assert.equal(
                    respuesta.status,
                    500
                );

                assert.deepEqual(
                    respuesta.body,
                    {
                        error:
                            "No se pudo registrar el producto.",
                    }
                );

                assert.deepEqual(
                    await contar(),
                    antes
                );
            } finally {
                await pool.query(
                    `ALTER TABLE ${tabla}
                     DROP CONSTRAINT fallo_prueba`
                );
            }
        }

        assert.equal(
            (await post(producto())).status,
            201
        );
    }
);