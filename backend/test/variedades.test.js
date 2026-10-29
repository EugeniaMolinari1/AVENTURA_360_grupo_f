require("dotenv").config();

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const { crearApp } = require("../src/app");
const {
    validarVariedad,
    normalizarVariedad,
} = require("../src/validators/variedades.validator");

const variedad = (extra = {}) => ({
    id_producto: 1,
    color: "Rojo",
    medida: "M",
    tamano_capacidad: "30 L",
    stock: 10,
    stock_minimo: 2,
    ...extra,
});

test("validador acepta combinaciones validas de caracteristicas y stock en cero", () => {
    const validos = [
        variedad(),
        { id_producto: 1, color: "Rojo", stock: 0, stock_minimo: 0 },
        { id_producto: 1, medida: "M", stock: 1, stock_minimo: 1 },
        { id_producto: 1, tamano_capacidad: "1 L", stock: 1, stock_minimo: 1 },
        variedad({ medida: null, tamano_capacidad: null }),
        variedad({ stock: 2147483647, stock_minimo: 2147483647 }),
    ];

    for (const datos of validos) {
        assert.deepEqual(validarVariedad(datos), [], JSON.stringify(datos));
    }
});

test("validador rechaza datos invalidos", () => {
    const sinCaracteristicas = {
        id_producto: 1,
        stock: 1,
        stock_minimo: 1,
    };
    const invalidos = [
        null,
        [],
        "texto",
        undefined,
        {},
        sinCaracteristicas,
        { ...sinCaracteristicas, color: null, medida: null, tamano_capacidad: null },
        ...[undefined, null, 0, -1, 1.5, "1", "abc", true, 2147483648].map(
            (id_producto) => variedad({ id_producto })
        ),
        ...["stock", "stock_minimo"].flatMap((campo) =>
            [undefined, null, -1, 1.5, "1", "", true, NaN, Infinity, 2147483648].map(
                (valor) => variedad({ [campo]: valor })
            )
        ),
        ...["color", "medida", "tamano_capacidad"].flatMap((campo) =>
            ["", "   ", 5, true, [], {}].map((valor) =>
                variedad({ [campo]: valor })
            )
        ),
        ...["precio", "activo", "sku", "id_variedad", "imagenes"].map(
            (campo) => variedad({ [campo]: 1 })
        ),
    ];

    for (const datos of invalidos) {
        assert.ok(validarVariedad(datos).length, JSON.stringify(datos));
    }
});

test("normalizarVariedad recorta, colapsa espacios y convierte lo no informado en null", () => {
    assert.deepEqual(
        normalizarVariedad({
            id_producto: 3,
            color: "  Rojo   oscuro  ",
            tamano_capacidad: "\t30  L ",
            stock: 5,
            stock_minimo: 1,
        }),
        {
            id_producto: 3,
            color: "Rojo oscuro",
            medida: null,
            tamano_capacidad: "30 L",
            stock: 5,
            stock_minimo: 1,
        }
    );
});

const esquema = `hu26_test_${randomUUID().replaceAll("-", "")}`;

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
let idActivo;
let idOtroActivo;
let idInactivo;

before(async () => {
    admin = new Pool(config);

    await admin.query(`CREATE SCHEMA ${esquema}`);

    pool = new Pool({
        ...config,
        options: `-c search_path=${esquema}`,
        max: 1,
    });

    for (const archivo of ["001_hu19_productos.sql", "002_hu26_variedades.sql"]) {
        await pool.query(
            readFileSync(join(__dirname, "../src/db/sql", archivo), "utf8")
        );
    }

    const crearProducto = async (nombre, activo) =>
        (
            await pool.query(
                `INSERT INTO producto (nombre, descripcion, marca, precio, dimensiones, activo)
                 VALUES ($1, 'Descripcion', 'Marca', 10, '10 x 10', $2)
                 RETURNING id_producto`,
                [nombre, activo]
            )
        ).rows[0].id_producto;

    idActivo = await crearProducto("Producto activo", true);
    idOtroActivo = await crearProducto("Otro producto activo", true);
    idInactivo = await crearProducto("Producto inactivo", false);

    servidor = crearApp(pool).listen(0, "127.0.0.1");

    await new Promise((resolve) => servidor.once("listening", resolve));

    url = `http://127.0.0.1:${servidor.address().port}/api/variedades`;
});

after(async () => {
    if (servidor) {
        await new Promise((resolve, reject) =>
            servidor.close((error) => (error ? reject(error) : resolve()))
        );
    }

    if (pool) {
        await pool.end();
    }

    if (admin) {
        try {
            await admin.query(`DROP SCHEMA IF EXISTS ${esquema} CASCADE`);
        } finally {
            await admin.end();
        }
    }
});

async function post(datos, opciones = {}) {
    const respuesta = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: typeof datos === "string" ? datos : JSON.stringify(datos),
        ...opciones,
    });

    return { status: respuesta.status, body: await respuesta.json() };
}

const contarVariedades = async () =>
    Number(
        (await pool.query("SELECT count(*) FROM variedad")).rows[0].count
    );

test("POST registra una variedad asociada al producto con todas las caracteristicas", async () => {
    const { status, body } = await post(variedad({ id_producto: idActivo }));

    assert.equal(status, 201);
    assert.equal(body.id_producto, idActivo);
    assert.equal(body.color, "Rojo");
    assert.equal(body.medida, "M");
    assert.equal(body.tamano_capacidad, "30 L");
    assert.equal(body.stock, 10);
    assert.equal(body.stock_minimo, 2);
    assert.ok(body.id_variedad);
    assert.deepEqual(
        Object.keys(body).sort(),
        [
            "color",
            "id_producto",
            "id_variedad",
            "medida",
            "stock",
            "stock_minimo",
            "tamano_capacidad",
        ].sort()
    );

    const { rows } = await pool.query(
        "SELECT * FROM variedad WHERE id_variedad = $1",
        [body.id_variedad]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id_producto, idActivo);
});

test("POST registra variedades con una sola caracteristica y stock en cero", async () => {
    for (const parcial of [
        { color: "Azul" },
        { medida: "Grande" },
        { tamano_capacidad: "500 ml" },
    ]) {
        const { status, body } = await post({
            id_producto: idActivo,
            stock: 0,
            stock_minimo: 0,
            ...parcial,
        });

        assert.equal(status, 201, JSON.stringify(body));
        assert.equal(body.stock, 0);
        assert.equal(body.stock_minimo, 0);
        for (const campo of ["color", "medida", "tamano_capacidad"]) {
            assert.equal(body[campo], parcial[campo] ?? null);
        }
    }
});

test("POST guarda los textos normalizados", async () => {
    const { status, body } = await post({
        id_producto: idActivo,
        color: "  Verde   militar ",
        stock: 1,
        stock_minimo: 1,
    });

    assert.equal(status, 201);
    assert.equal(body.color, "Verde militar");
});

test("el stock se administra por variedad, no por producto", async () => {
    const a = await post({
        id_producto: idOtroActivo,
        color: "Negro",
        stock: 5,
        stock_minimo: 1,
    });
    const b = await post({
        id_producto: idOtroActivo,
        color: "Blanco",
        stock: 40,
        stock_minimo: 3,
    });

    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.notEqual(a.body.id_variedad, b.body.id_variedad);

    const { rows } = await pool.query(
        "SELECT color, stock FROM variedad WHERE id_producto = $1 ORDER BY color",
        [idOtroActivo]
    );
    assert.deepEqual(rows, [
        { color: "Blanco", stock: 40 },
        { color: "Negro", stock: 5 },
    ]);

    const columnas = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'producto' AND column_name LIKE 'stock%'`,
        [esquema]
    );
    assert.equal(columnas.rowCount, 0);
});

test("POST rechaza datos invalidos sin crear filas", async () => {
    const antes = await contarVariedades();

    const casos = [
        {},
        variedad({ id_producto: idActivo, stock: -1 }),
        variedad({ id_producto: idActivo, stock_minimo: 1.5 }),
        variedad({ id_producto: idActivo, stock: undefined }),
        { id_producto: idActivo, stock: 1, stock_minimo: 1 },
        variedad({ id_producto: idActivo, color: "   ", medida: null, tamano_capacidad: null }),
        variedad({ id_producto: "1" }),
        variedad({ id_producto: idActivo, precio: 10 }),
        variedad({ id_producto: idActivo, activo: true }),
        variedad({ id_producto: idActivo, sku: "ABC" }),
        [],
        "texto",
    ];

    for (const datos of casos) {
        const respuesta = await post(datos);

        assert.equal(respuesta.status, 400, JSON.stringify(datos));
        assert.ok(respuesta.body.errores.length);
    }

    assert.equal(await contarVariedades(), antes);
});

test("POST rechaza JSON malformado y cuerpo vacio", async () => {
    const malformado = await post("{ no es json");
    assert.equal(malformado.status, 400);
    assert.deepEqual(malformado.body, {
        errores: ["El cuerpo debe ser JSON valido."],
    });

    const vacio = await fetch(url, { method: "POST" });
    assert.equal(vacio.status, 400);
    assert.ok((await vacio.json()).errores.length);
});

test("POST responde 404 si el producto no existe", async () => {
    const antes = await contarVariedades();
    const { status, body } = await post(variedad({ id_producto: 999999 }));

    assert.equal(status, 404);
    assert.deepEqual(body, { errores: ["El producto indicado no existe."] });
    assert.equal(await contarVariedades(), antes);
});

test("POST rechaza un producto inactivo", async () => {
    const antes = await contarVariedades();
    const { status, body } = await post(variedad({ id_producto: idInactivo }));

    assert.equal(status, 400);
    assert.deepEqual(body, { errores: ["El producto indicado no esta activo."] });
    assert.equal(await contarVariedades(), antes);
});

test("no permite duplicados del mismo producto ignorando mayusculas y espacios", async () => {
    const base = {
        id_producto: idActivo,
        color: "Amarillo",
        medida: "XL",
        stock: 3,
        stock_minimo: 1,
    };
    assert.equal((await post(base)).status, 201);

    const antes = await contarVariedades();
    const duplicados = [
        base,
        { ...base, color: "amarillo", medida: "xl" },
        { ...base, color: "  AMARILLO  ", medida: " Xl " },
        { ...base, color: "Amarillo", medida: "XL", stock: 99, stock_minimo: 9 },
        { ...base, tamano_capacidad: undefined },
        { ...base, tamano_capacidad: null },
    ];

    for (const datos of duplicados) {
        const respuesta = await post(datos);

        assert.equal(respuesta.status, 400, JSON.stringify(datos));
        assert.deepEqual(respuesta.body, {
            errores: [
                "Ya existe una variedad de este producto con las mismas caracteristicas.",
            ],
        });
    }

    assert.equal(await contarVariedades(), antes);
});

test("los NULL cuentan como iguales y las combinaciones distintas no son duplicados", async () => {
    const soloColor = {
        id_producto: idActivo,
        color: "Naranja",
        stock: 1,
        stock_minimo: 1,
    };
    assert.equal((await post(soloColor)).status, 201);
    assert.equal((await post(soloColor)).status, 400);

    // Misma caracteristica pero en otro campo: es otra variedad.
    assert.equal(
        (await post({ ...soloColor, color: undefined, medida: "Naranja" })).status,
        201
    );
    // Se agrega una caracteristica mas: tambien es otra variedad.
    assert.equal((await post({ ...soloColor, medida: "S" })).status, 201);
    assert.equal((await post({ ...soloColor, medida: "S" })).status, 400);
});

test("el mismo conjunto de caracteristicas puede repetirse en productos distintos", async () => {
    const datos = { color: "Violeta", stock: 1, stock_minimo: 1 };

    assert.equal((await post({ ...datos, id_producto: idActivo })).status, 201);
    assert.equal((await post({ ...datos, id_producto: idOtroActivo })).status, 201);
});

test("la base de datos aplica por si sola sus restricciones", async () => {
    const insertar = (valores) =>
        pool.query(
            `INSERT INTO variedad (id_producto, color, medida, tamano_capacidad, stock, stock_minimo)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            valores
        );

    await assert.rejects(insertar([idActivo, null, null, null, 1, 1]), { code: "23514" });
    await assert.rejects(insertar([idActivo, "  ", null, null, 1, 1]), { code: "23514" });
    await assert.rejects(insertar([idActivo, "Gris", null, null, -1, 1]), { code: "23514" });
    await assert.rejects(insertar([idActivo, "Gris", null, null, 1, -1]), { code: "23514" });
    await assert.rejects(insertar([999999, "Gris", null, null, 1, 1]), { code: "23503" });

    await insertar([idActivo, "Gris", null, null, 1, 1]);
    await assert.rejects(insertar([idActivo, " GRIS ", null, null, 1, 1]), { code: "23505" });
});

test("rollback ante un fallo inesperado y el cliente queda reutilizable", async () => {
    const antes = await contarVariedades();

    await pool.query(
        "ALTER TABLE variedad ADD CONSTRAINT fallo_prueba CHECK (stock <> 77) NOT VALID"
    );

    try {
        const respuesta = await post({
            id_producto: idActivo,
            color: "Fallo",
            stock: 77,
            stock_minimo: 1,
        });

        assert.equal(respuesta.status, 500);
        assert.deepEqual(respuesta.body, {
            error: "No se pudo registrar la variedad.",
        });
        assert.equal(await contarVariedades(), antes);
    } finally {
        await pool.query("ALTER TABLE variedad DROP CONSTRAINT fallo_prueba");
    }

    // El pool tiene un unico cliente: debe haberse liberado.
    const { status } = await post({
        id_producto: idActivo,
        color: "Despues del fallo",
        stock: 1,
        stock_minimo: 1,
    });
    assert.equal(status, 201);
});
