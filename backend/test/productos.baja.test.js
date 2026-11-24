require("dotenv").config();

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const { crearApp } = require("../src/app");

const esquema =
    `hu21_test_${randomUUID().replaceAll("-", "")}`;

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

const servicioImagenesFalso = {
    async subirImagen() {
        contadorImagenes += 1;

        return {
            url:
                `https://cloudinary.test/hu21-${contadorImagenes}.png`,
            public_id:
                `aventura360/hu21/imagen-${contadorImagenes}`,
        };
    },

    async eliminarImagen() {
        return undefined;
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

function datosProducto() {
    return {
        nombre: "Carpa para dar de baja",
        descripcion: "Producto de prueba HU-21",
        marca: "Marca prueba",
        precio: "150.00",
        dimensiones: "200 x 150 cm",
        tipo: "carpa",
        detalle: {
            capacidad_personas: 2,
            peso_kg: 2.5,
        },
        ocasiones: [1, 2],
    };
}

async function registrarProducto() {
    const form = new FormData();
    const datos = datosProducto();

    for (const [campo, valor] of Object.entries(datos)) {
        if (
            campo === "detalle" ||
            campo === "ocasiones"
        ) {
            form.append(campo, JSON.stringify(valor));
        } else {
            form.append(campo, String(valor));
        }
    }

    form.append(
        "imagenes",
        new Blob(
            [Buffer.from("imagen prueba")],
            { type: "image/png" }
        ),
        "imagen.png"
    );

    const respuesta = await fetch(url, {
        method: "POST",
        body: form,
    });

    return {
        status: respuesta.status,
        body: await respuesta.json(),
    };
}

test(
    "DELETE da de baja un producto activo",
    async () => {
        const registro = await registrarProducto();

        assert.equal(registro.status, 201);

        const respuesta = await fetch(
            `${url}/${registro.body.id_producto}`,
            {
                method: "DELETE",
            }
        );

        const body = await respuesta.json();

        assert.equal(respuesta.status, 200);

        assert.equal(
            body.producto.id_producto,
            registro.body.id_producto
        );

        assert.equal(
            body.producto.activo,
            false
        );

        assert.equal(
            body.mensaje,
            "Producto dado de baja correctamente."
        );

        const base = await pool.query(
            `SELECT activo
             FROM producto
             WHERE id_producto = $1`,
            [registro.body.id_producto]
        );

        assert.equal(
            base.rows[0].activo,
            false
        );
    }
);

test(
    "DELETE conserva la informacion relacionada",
    async () => {
        const registro = await registrarProducto();

        assert.equal(registro.status, 201);

        const idProducto =
            registro.body.id_producto;

        const detalleAntes = await pool.query(
            `SELECT *
             FROM carpa
             WHERE id_producto = $1`,
            [idProducto]
        );

        const ocasionesAntes = await pool.query(
            `SELECT id_ocasion
             FROM producto_ocasion
             WHERE id_producto = $1
             ORDER BY id_ocasion`,
            [idProducto]
        );

        const imagenesAntes = await pool.query(
            `SELECT id_imagen
             FROM imagen
             WHERE id_producto = $1
             ORDER BY id_imagen`,
            [idProducto]
        );

        const respuesta = await fetch(
            `${url}/${idProducto}`,
            {
                method: "DELETE",
            }
        );

        assert.equal(respuesta.status, 200);

        const detalleDespues = await pool.query(
            `SELECT *
             FROM carpa
             WHERE id_producto = $1`,
            [idProducto]
        );

        const ocasionesDespues = await pool.query(
            `SELECT id_ocasion
             FROM producto_ocasion
             WHERE id_producto = $1
             ORDER BY id_ocasion`,
            [idProducto]
        );

        const imagenesDespues = await pool.query(
            `SELECT id_imagen
             FROM imagen
             WHERE id_producto = $1
             ORDER BY id_imagen`,
            [idProducto]
        );

        assert.equal(
            detalleDespues.rowCount,
            detalleAntes.rowCount
        );

        assert.deepEqual(
            ocasionesDespues.rows,
            ocasionesAntes.rows
        );

        assert.deepEqual(
            imagenesDespues.rows,
            imagenesAntes.rows
        );
    }
);

test(
    "DELETE rechaza producto inexistente",
    async () => {
        const respuesta = await fetch(
            `${url}/999999`,
            {
                method: "DELETE",
            }
        );

        const body = await respuesta.json();

        assert.equal(respuesta.status, 404);

        assert.ok(
            body.errores.includes(
                "Producto no encontrado."
            )
        );
    }
);

test(
    "DELETE rechaza un producto ya dado de baja",
    async () => {
        const registro = await registrarProducto();

        assert.equal(registro.status, 201);

        const endpoint =
            `${url}/${registro.body.id_producto}`;

        const primeraBaja = await fetch(
            endpoint,
            {
                method: "DELETE",
            }
        );

        assert.equal(primeraBaja.status, 200);

        const segundaBaja = await fetch(
            endpoint,
            {
                method: "DELETE",
            }
        );

        const body = await segundaBaja.json();

        assert.equal(segundaBaja.status, 400);

        assert.ok(
            body.errores.includes(
                "El producto ya se encuentra dado de baja."
            )
        );
    }
);

test(
    "DELETE rechaza identificador invalido",
    async () => {
        const respuesta = await fetch(
            `${url}/abc`,
            {
                method: "DELETE",
            }
        );

        const body = await respuesta.json();

        assert.equal(respuesta.status, 400);

        assert.ok(
            body.errores.includes(
                "El identificador del producto no es valido."
            )
        );
    }
);
