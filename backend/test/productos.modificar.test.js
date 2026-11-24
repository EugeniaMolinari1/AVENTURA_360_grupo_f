require("dotenv").config();

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const { crearApp } = require("../src/app");

const esquema =
    `hu20_test_${randomUUID().replaceAll("-", "")}`;

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
            url:
                `https://cloudinary.test/hu20-${contadorImagenes}.png`,
            public_id:
                `aventura360/hu20/imagen-${contadorImagenes}`,
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

function datosProducto() {
    return {
        nombre: "Carpa original",
        descripcion: "Descripcion original",
        marca: "Marca original",
        precio: "100.00",
        dimensiones: "200 x 150 cm",
        tipo: "carpa",
        detalle: {
            capacidad_personas: 2,
            peso_kg: 2.5,
        },
        ocasiones: [1, 2],
    };
}

async function enviarMultipart(
    metodo,
    endpoint,
    datos,
    imagenes = 0
) {
    const form = new FormData();

    for (const [campo, valor] of Object.entries(datos)) {
        if (
            campo === "detalle" ||
            campo === "ocasiones" ||
            campo === "imagenes_conservadas"
        ) {
            form.append(campo, JSON.stringify(valor));
        } else {
            form.append(campo, String(valor));
        }
    }

    for (let i = 0; i < imagenes; i += 1) {
        form.append(
            "imagenes",
            new Blob(
                [Buffer.from(`imagen ${i}`)],
                { type: "image/png" }
            ),
            `imagen-${i}.png`
        );
    }

    const respuesta = await fetch(endpoint, {
        method: metodo,
        body: form,
    });

    return {
        status: respuesta.status,
        body: await respuesta.json(),
    };
}

async function registrarProducto() {
    return enviarMultipart(
        "POST",
        url,
        datosProducto(),
        2
    );
}

test(
    "GET obtiene los datos actuales del producto",
    async () => {
        const registro = await registrarProducto();

        assert.equal(registro.status, 201);

        const respuesta = await fetch(
            `${url}/${registro.body.id_producto}`
        );

        const body = await respuesta.json();

        assert.equal(respuesta.status, 200);
        assert.equal(body.nombre, "Carpa original");
        assert.equal(body.tipo, "carpa");
        assert.equal(
            body.detalle.capacidad_personas,
            2
        );
        assert.deepEqual(body.ocasiones, [1, 2]);
        assert.equal(body.imagenes.length, 2);
    }
);

test(
    "PUT modifica datos, subtipo, ocasiones e imagenes",
    async () => {
        const registro = await registrarProducto();

        assert.equal(registro.status, 201);

        const consulta = await fetch(
            `${url}/${registro.body.id_producto}`
        );

        const actual = await consulta.json();

        const imagenConservada =
            actual.imagenes[0].id_imagen;

        const publicIdEliminado =
            actual.imagenes[1].public_id;

        const modificados = {
            nombre: "Carpa modificada",
            descripcion: "Descripcion actualizada",
            marca: "Nueva marca",
            precio: "250.50",
            dimensiones: "220 x 180 cm",
            tipo: "carpa",
            detalle: {
                capacidad_personas: 4,
                peso_kg: 3.2,
            },
            ocasiones: [3, 4],
            imagenes_conservadas: [
                imagenConservada,
            ],
        };

        const respuesta = await enviarMultipart(
            "PUT",
            `${url}/${registro.body.id_producto}`,
            modificados,
            1
        );

        assert.equal(respuesta.status, 200);

        assert.equal(
            respuesta.body.id_producto,
            registro.body.id_producto
        );

        assert.equal(
            respuesta.body.nombre,
            "Carpa modificada"
        );

        assert.equal(
            respuesta.body.precio,
            "250.50"
        );

        assert.equal(
            respuesta.body.tipo,
            "carpa"
        );

        assert.equal(
            respuesta.body.detalle.capacidad_personas,
            4
        );

        assert.equal(
            respuesta.body.detalle.peso_kg,
            "3.2"
        );

        assert.deepEqual(
            respuesta.body.ocasiones,
            [3, 4]
        );

        assert.equal(
            respuesta.body.imagenes.length,
            2
        );

        assert.equal(
            respuesta.body.imagenes.filter(
                (imagen) => imagen.principal
            ).length,
            1
        );

        assert.ok(
            imagenesEliminadas.includes(
                publicIdEliminado
            )
        );

        const base = await pool.query(
            `SELECT
                nombre,
                marca,
                precio,
                dimensiones,
                activo
             FROM producto
             WHERE id_producto = $1`,
            [registro.body.id_producto]
        );

        assert.equal(
            base.rows[0].nombre,
            "Carpa modificada"
        );

        assert.equal(
            base.rows[0].activo,
            true
        );

        const detalle = await pool.query(
            `SELECT capacidad_personas, peso_kg
             FROM carpa
             WHERE id_producto = $1`,
            [registro.body.id_producto]
        );

        assert.equal(
            detalle.rows[0].capacidad_personas,
            4
        );

        const ocasiones = await pool.query(
            `SELECT id_ocasion
             FROM producto_ocasion
             WHERE id_producto = $1
             ORDER BY id_ocasion`,
            [registro.body.id_producto]
        );

        assert.deepEqual(
            ocasiones.rows.map(
                (fila) => fila.id_ocasion
            ),
            [3, 4]
        );
    }
);

test(
    "PUT rechaza producto inexistente",
    async () => {
        const datos = {
            ...datosProducto(),
            imagenes_conservadas: [],
        };

        const respuesta = await enviarMultipart(
            "PUT",
            `${url}/999999`,
            datos,
            1
        );

        assert.equal(respuesta.status, 404);
    }
);

test(
    "PUT impide cambiar el tipo del producto",
    async () => {
        const registro = await registrarProducto();

        const consulta = await fetch(
            `${url}/${registro.body.id_producto}`
        );

        const actual = await consulta.json();

        const datos = {
            nombre: "Producto",
            descripcion: "Descripcion",
            marca: "Marca",
            precio: "100.00",
            dimensiones: "20 x 30",
            tipo: "mochila",
            detalle: {
                capacidad_litros: 30,
            },
            ocasiones: [1],
            imagenes_conservadas:
                actual.imagenes.map(
                    (imagen) => imagen.id_imagen
                ),
        };

        const respuesta = await enviarMultipart(
            "PUT",
            `${url}/${registro.body.id_producto}`,
            datos
        );

        assert.equal(respuesta.status, 400);

        assert.ok(
            respuesta.body.errores.includes(
                "No se puede modificar el tipo del producto."
            )
        );
    }
);

test(
    "PUT exige que el producto conserve al menos una imagen",
    async () => {
        const registro = await registrarProducto();

        const datos = {
            ...datosProducto(),
            imagenes_conservadas: [],
        };

        const respuesta = await enviarMultipart(
            "PUT",
            `${url}/${registro.body.id_producto}`,
            datos
        );

        assert.equal(respuesta.status, 400);

        assert.ok(
            respuesta.body.errores.includes(
                "El producto debe conservar al menos una imagen."
            )
        );
    }
);

test(
    "PUT rechaza ocasiones inexistentes sin modificar el producto",
    async () => {
        const registro = await registrarProducto();

        const consulta = await fetch(
            `${url}/${registro.body.id_producto}`
        );

        const actual = await consulta.json();

        const datos = {
            ...datosProducto(),
            nombre: "No debe guardarse",
            ocasiones: [999999],
            imagenes_conservadas:
                actual.imagenes.map(
                    (imagen) => imagen.id_imagen
                ),
        };

        const respuesta = await enviarMultipart(
            "PUT",
            `${url}/${registro.body.id_producto}`,
            datos
        );

        assert.equal(respuesta.status, 400);

        const posterior = await fetch(
            `${url}/${registro.body.id_producto}`
        );

        const productoPosterior =
            await posterior.json();

        assert.equal(
            productoPosterior.nombre,
            "Carpa original"
        );

        assert.deepEqual(
            productoPosterior.ocasiones,
            [1, 2]
        );
    }
);