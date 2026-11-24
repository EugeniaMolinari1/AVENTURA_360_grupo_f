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
    `hu23_test_${randomUUID().replaceAll("-", "")}`;

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
let urlVariedades;

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

    servidor = crearApp(pool).listen(
        0,
        "127.0.0.1"
    );

    await new Promise((resolve) =>
        servidor.once(
            "listening",
            resolve
        )
    );

    const base =
        `http://127.0.0.1:${servidor.address().port}/api`;

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

async function crearProducto() {
    const {
        rows: [producto],
    } = await pool.query(
        `INSERT INTO producto
            (
                nombre,
                descripcion,
                marca,
                precio,
                dimensiones,
                activo
            )
         VALUES
            (
                'Producto HU-23',
                'Producto para gestionar stock',
                'Marca prueba',
                150.00,
                '200 x 150 cm',
                TRUE
            )
         RETURNING *`
    );

    return producto;
}

async function crearVariedad(
    idProducto,
    stock = 8,
    stockMinimo = 2
) {
    const {
        rows: [variedad],
    } = await pool.query(
        `INSERT INTO variedad
            (
                id_producto,
                color,
                medida,
                tamano_capacidad,
                stock,
                stock_minimo
            )
         VALUES
            (
                $1,
                'Verde',
                NULL,
                '4 personas',
                $2,
                $3
            )
         RETURNING *`,
        [
            idProducto,
            stock,
            stockMinimo,
        ]
    );

    return variedad;
}

async function modificarStock(
    idVariedad,
    body
) {
    const respuesta =
        await fetch(
            `${urlVariedades}/${idVariedad}/stock`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type":
                        "application/json",
                },
                body: JSON.stringify(body),
            }
        );

    return {
        status: respuesta.status,
        body: await respuesta.json(),
    };
}

test(
    "PATCH permite aumentar el stock de una variedad",
    async () => {
        const producto =
            await crearProducto();

        const variedad =
            await crearVariedad(
                producto.id_producto,
                8,
                2
            );

        const respuesta =
            await modificarStock(
                variedad.id_variedad,
                {
                    stock: 15,
                }
            );

        assert.equal(
            respuesta.status,
            200
        );

        assert.equal(
            respuesta.body.stock,
            15
        );

        assert.equal(
            respuesta.body.stock_minimo,
            2
        );

        assert.equal(
            respuesta.body.estado_stock,
            "disponible"
        );
    }
);

test(
    "PATCH permite disminuir el stock de una variedad",
    async () => {
        const producto =
            await crearProducto();

        const variedad =
            await crearVariedad(
                producto.id_producto,
                8,
                2
            );

        const respuesta =
            await modificarStock(
                variedad.id_variedad,
                {
                    stock: 5,
                }
            );

        assert.equal(
            respuesta.status,
            200
        );

        assert.equal(
            respuesta.body.stock,
            5
        );

        assert.equal(
            respuesta.body.estado_stock,
            "disponible"
        );
    }
);

test(
    "PATCH informa stock bajo cuando queda igual al minimo",
    async () => {
        const producto =
            await crearProducto();

        const variedad =
            await crearVariedad(
                producto.id_producto,
                8,
                2
            );

        const respuesta =
            await modificarStock(
                variedad.id_variedad,
                {
                    stock: 2,
                }
            );

        assert.equal(
            respuesta.status,
            200
        );

        assert.equal(
            respuesta.body.stock,
            2
        );

        assert.equal(
            respuesta.body.estado_stock,
            "stock_bajo"
        );
    }
);

test(
    "PATCH informa stock bajo cuando queda por debajo del minimo",
    async () => {
        const producto =
            await crearProducto();

        const variedad =
            await crearVariedad(
                producto.id_producto,
                8,
                2
            );

        const respuesta =
            await modificarStock(
                variedad.id_variedad,
                {
                    stock: 1,
                }
            );

        assert.equal(
            respuesta.status,
            200
        );

        assert.equal(
            respuesta.body.stock,
            1
        );

        assert.equal(
            respuesta.body.estado_stock,
            "stock_bajo"
        );
    }
);

test(
    "PATCH permite establecer stock en cero e informa sin stock",
    async () => {
        const producto =
            await crearProducto();

        const variedad =
            await crearVariedad(
                producto.id_producto,
                8,
                2
            );

        const respuesta =
            await modificarStock(
                variedad.id_variedad,
                {
                    stock: 0,
                }
            );

        assert.equal(
            respuesta.status,
            200
        );

        assert.equal(
            respuesta.body.stock,
            0
        );

        assert.equal(
            respuesta.body.estado_stock,
            "sin_stock"
        );
    }
);

test(
    "PATCH rechaza stock negativo",
    async () => {
        const producto =
            await crearProducto();

        const variedad =
            await crearVariedad(
                producto.id_producto
            );

        const respuesta =
            await modificarStock(
                variedad.id_variedad,
                {
                    stock: -1,
                }
            );

        assert.equal(
            respuesta.status,
            400
        );
    }
);

test(
    "PATCH no permite modificar stock_minimo",
    async () => {
        const producto =
            await crearProducto();

        const variedad =
            await crearVariedad(
                producto.id_producto,
                8,
                2
            );

        const respuesta =
            await modificarStock(
                variedad.id_variedad,
                {
                    stock: 10,
                    stock_minimo: 5,
                }
            );

        assert.equal(
            respuesta.status,
            400
        );

        assert.ok(
            respuesta.body.errores.includes(
                "Campo no permitido: stock_minimo."
            )
        );

        const {
            rows: [actual],
        } = await pool.query(
            `SELECT stock, stock_minimo
             FROM variedad
             WHERE id_variedad = $1`,
            [variedad.id_variedad]
        );

        assert.equal(
            actual.stock,
            8
        );

        assert.equal(
            actual.stock_minimo,
            2
        );
    }
);

test(
    "PATCH devuelve 404 si la variedad no existe",
    async () => {
        const respuesta =
            await modificarStock(
                999999,
                {
                    stock: 10,
                }
            );

        assert.equal(
            respuesta.status,
            404
        );

        assert.ok(
            respuesta.body.errores.includes(
                "La variedad indicada no existe."
            )
        );
    }
);

test(
    "PATCH rechaza identificador de variedad invalido",
    async () => {
        const respuesta =
            await modificarStock(
                "abc",
                {
                    stock: 10,
                }
            );

        assert.equal(
            respuesta.status,
            400
        );

        assert.ok(
            respuesta.body.errores.includes(
                "El identificador de la variedad no es valido."
            )
        );
    }
);