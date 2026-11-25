require("dotenv").config();

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const { Pool } = require("pg");
const { SignJWT } = require("jose");
const { crearApp } = require("../src/app");
const { ErrorAutenticacion } = require("../src/services/auth/errores");

// Los proveedores son simulados: estas pruebas verifican el flujo propio
// (estado, PKCE, sesion, rol, duplicados, errores). NO prueban la autenticacion
// real con Google ni Facebook; eso requiere la verificacion manual.

const FRONTEND = "http://localhost:5173";
const configBase = {
    backendUrl: "http://localhost:3001",
    frontendUrl: FRONTEND,
    frontendOrigin: FRONTEND,
    sessionSecret: "t".repeat(48),
    cookieSegura: false,
    google: { clientId: "x", clientSecret: "x" },
    facebook: { appId: "x", appSecret: "x", graphVersion: "v23.0" },
};

const esquema = `hu06_test_${randomUUID().replaceAll("-", "")}`;
const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
};

let admin;
let pool;
let principal;
const servidores = [];

// Proveedor simulado: cada codigo devuelve un perfil o lanza un error. Ademas
// comprueba que el verificador PKCE recibido corresponda al desafio enviado.
function crearProveedorFalso(nombre) {
    const resultados = new Map();
    const desafios = new Map();

    return {
        resultados,
        iniciar({ state, nonce, codeChallenge }) {
            desafios.set(nonce, codeChallenge);

            return `https://${nombre}.fake.test/autorizar?state=${state}`;
        },
        async completar({ code, codigoVerificador, nonce }) {
            const desafio = createHash("sha256")
                .update(codigoVerificador)
                .digest("base64url");

            if (desafios.get(nonce) !== desafio) throw new Error("PKCE invalido");

            const resultado = resultados.get(code);

            if (resultado instanceof Error) throw resultado;
            if (!resultado) throw new ErrorAutenticacion("proveedor_error");

            return resultado;
        },
    };
}

async function levantar(opciones) {
    const servidor = crearApp(pool, undefined, opciones).listen(0, "127.0.0.1");

    await new Promise((resolve) => servidor.once("listening", resolve));
    servidores.push(servidor);

    return `http://127.0.0.1:${servidor.address().port}`;
}

let google;
let facebook;

before(async () => {
    admin = new Pool(dbConfig);
    await admin.query(`CREATE SCHEMA ${esquema}`);

    pool = new Pool({
        ...dbConfig,
        options: `-c search_path=${esquema}`,
        max: 5,
    });

    await pool.query(
        readFileSync(join(__dirname, "../src/db/sql/004_hu06_usuarios.sql"), "utf8")
    );

    google = crearProveedorFalso("google");
    facebook = crearProveedorFalso("facebook");
    principal = await levantar({
        config: configBase,
        proveedores: { google, facebook },
    });
});

after(async () => {
    for (const servidor of servidores) {
        await new Promise((resolve, reject) =>
            servidor.close((error) => (error ? reject(error) : resolve()))
        );
    }

    if (pool) await pool.end();

    if (admin) {
        try {
            await admin.query(`DROP SCHEMA IF EXISTS ${esquema} CASCADE`);
        } finally {
            await admin.end();
        }
    }
});

const perfil = (proveedor, id, correo, extra = {}) => ({
    proveedor,
    id_proveedor: id,
    nombre: "Ana",
    apellido: "Perez",
    correo_electronico: correo,
    ...extra,
});

// --- utilidades HTTP -------------------------------------------------------

function leerCookie(respuesta, nombre) {
    const linea = respuesta.headers
        .getSetCookie()
        .find((c) => c.startsWith(`${nombre}=`));

    if (!linea) return null;

    const [par, ...atributos] = linea.split("; ");

    return {
        par,
        valor: par.slice(nombre.length + 1),
        atributos: atributos.map((a) => a.toLowerCase()),
    };
}

const cabeceraCookie = (...cookies) =>
    cookies.filter(Boolean).map((c) => c.par).join("; ");

function resultado(respuesta) {
    const ubicacion = respuesta.headers.get("location");
    const url = ubicacion ? new URL(ubicacion) : null;

    return {
        status: respuesta.status,
        url,
        auth: url?.searchParams.get("auth"),
        motivo: url?.searchParams.get("motivo"),
        sesion: leerCookie(respuesta, "a360_sesion"),
    };
}

async function iniciarFlujo(nombre, { base = principal, cookies = "" } = {}) {
    const respuesta = await fetch(`${base}/api/auth/${nombre}`, {
        redirect: "manual",
        headers: cookies ? { Cookie: cookies } : {},
    });
    const oauth = leerCookie(respuesta, "a360_oauth");

    return {
        respuesta,
        oauth,
        state: respuesta.headers.get("location")
            ? new URL(respuesta.headers.get("location")).searchParams.get("state")
            : null,
    };
}

async function callback(nombre, { base = principal, consulta, oauth }) {
    const respuesta = await fetch(
        `${base}/api/auth/${nombre}/callback?${new URLSearchParams(consulta)}`,
        {
            redirect: "manual",
            headers: oauth ? { Cookie: oauth.par } : {},
        }
    );

    return { respuesta, ...resultado(respuesta) };
}

// Recorre el flujo completo: inicio y callback con el state recibido.
async function ingresar(nombre, code, opciones = {}) {
    const { oauth, state } = await iniciarFlujo(nombre, opciones);

    return callback(nombre, {
        ...opciones,
        consulta: { code, state, ...(opciones.consulta ?? {}) },
        oauth,
    });
}

async function me(sesion, { base = principal, cabeceras = {} } = {}) {
    const respuesta = await fetch(`${base}/api/auth/me`, {
        headers: { ...(sesion ? { Cookie: sesion.par } : {}), ...cabeceras },
    });

    return { respuesta, status: respuesta.status, body: await respuesta.json() };
}

const contar = async (tabla) =>
    Number((await pool.query(`SELECT count(*) FROM ${tabla}`)).rows[0].count);

// --- registro correcto -----------------------------------------------------

for (const [nombre, proveedor] of [
    ["google", () => google],
    ["facebook", () => facebook],
]) {
    test(`registro correcto con ${nombre}: usuario cliente autenticado`, async () => {
        const correo = `${nombre}.nuevo@example.com`;
        const id = `${nombre}-id-1`;

        proveedor().resultados.set("ok-1", perfil(nombre, id, correo));

        const inicio = await iniciarFlujo(nombre);

        assert.equal(inicio.respuesta.status, 302);
        assert.equal(
            new URL(inicio.respuesta.headers.get("location")).origin,
            `https://${nombre}.fake.test`
        );
        assert.ok(inicio.state);
        assert.ok(inicio.oauth);
        assert.ok(inicio.oauth.atributos.includes("httponly"));
        assert.ok(inicio.oauth.atributos.includes("samesite=lax"));
        assert.ok(inicio.oauth.atributos.includes("path=/api/auth"));

        const fin = await callback(nombre, {
            consulta: { code: "ok-1", state: inicio.state },
            oauth: inicio.oauth,
        });

        assert.equal(fin.status, 302);
        assert.equal(fin.url.origin, FRONTEND);
        assert.equal(fin.auth, "ok");
        assert.equal(fin.motivo, null);

        // Cookie de sesion segura, de 7 dias y sin el estado de OAuth.
        assert.ok(fin.sesion);
        assert.ok(fin.sesion.atributos.includes("httponly"));
        assert.ok(fin.sesion.atributos.includes("samesite=lax"));
        assert.ok(fin.sesion.atributos.includes("path=/"));
        assert.ok(fin.sesion.atributos.includes(`max-age=${7 * 24 * 60 * 60}`));
        assert.ok(!fin.sesion.atributos.includes("secure"));
        assert.equal(leerCookie(fin.respuesta, "a360_oauth").valor, "");

        const { status, body, respuesta } = await me(fin.sesion);

        assert.equal(status, 200);
        assert.equal(respuesta.headers.get("cache-control"), "no-store");
        assert.deepEqual(Object.keys(body).sort(), [
            "apellido",
            "correo_electronico",
            "id_usuario",
            "nombre",
            "rol",
        ]);
        assert.equal(body.rol, "cliente");
        assert.equal(body.nombre, "Ana");
        assert.equal(body.apellido, "Perez");
        assert.equal(body.correo_electronico, correo);

        const { rows } = await pool.query(
            `SELECT u.rol, u.dni, u.telefono, c.proveedor, c.id_proveedor
             FROM usuario u JOIN cuenta_social c USING (id_usuario)
             WHERE u.id_usuario = $1`,
            [body.id_usuario]
        );

        assert.deepEqual(rows, [
            { rol: "cliente", dni: null, telefono: null, proveedor: nombre, id_proveedor: id },
        ]);
    });
}

test("el apellido es opcional", async () => {
    google.resultados.set(
        "sin-apellido",
        perfil("google", "g-sin-apellido", "sin.apellido@example.com", { apellido: null })
    );

    const fin = await ingresar("google", "sin-apellido");
    const { body } = await me(fin.sesion);

    assert.equal(fin.auth, "ok");
    assert.equal(body.apellido, null);
});

test("el rol siempre es cliente, aunque el perfil o la peticion intenten otro", async () => {
    google.resultados.set(
        "rol",
        perfil("google", "g-rol", "rol@example.com", { rol: "administrador" })
    );

    const fin = await ingresar("google", "rol", {
        consulta: { rol: "administrador" },
    });
    const { body } = await me(fin.sesion);

    assert.equal(body.rol, "cliente");
    assert.equal(
        (await pool.query("SELECT rol FROM usuario WHERE id_usuario = $1", [body.id_usuario])).rows[0].rol,
        "cliente"
    );
});

test("la identidad sale del proveedor y no de datos enviados por el cliente", async () => {
    google.resultados.set("honesto", perfil("google", "g-honesto", "honesto@example.com"));

    const fin = await ingresar("google", "honesto", {
        consulta: {
            email: "atacante@example.com",
            correo_electronico: "atacante@example.com",
            nombre: "Atacante",
            id_proveedor: "otro-id",
            proveedor: "facebook",
            id_usuario: "1",
        },
    });
    const { body } = await me(fin.sesion);

    assert.equal(body.correo_electronico, "honesto@example.com");
    assert.equal(body.nombre, "Ana");
    assert.equal(
        (await pool.query("SELECT 1 FROM cuenta_social WHERE id_proveedor = 'otro-id'")).rowCount,
        0
    );
});

test("el destino de la redireccion es fijo y no se toma de la peticion", async () => {
    google.resultados.set("destino", perfil("google", "g-destino", "destino@example.com"));

    const inicio = await fetch(`${principal}/api/auth/google?redirect=https://evil.example&next=https://evil.example`, { redirect: "manual" });
    const fin = await ingresar("google", "destino", {
        consulta: { redirect: "https://evil.example", next: "https://evil.example", redirect_uri: "https://evil.example" },
    });

    assert.equal(new URL(inicio.headers.get("location")).origin, "https://google.fake.test");
    assert.equal(fin.url.origin, FRONTEND);
});

// --- buscar o crear, sin duplicados ----------------------------------------

test("una identidad existente inicia sesion sin duplicar usuario ni cuenta", async () => {
    google.resultados.set("dup", perfil("google", "g-dup", "dup@example.com"));

    const usuarios = await contar("usuario");
    const cuentas = await contar("cuenta_social");

    const primero = await ingresar("google", "dup");
    const segundo = await ingresar("google", "dup");
    const a = (await me(primero.sesion)).body;
    const b = (await me(segundo.sesion)).body;

    assert.equal(primero.auth, "ok");
    assert.equal(segundo.auth, "ok");
    assert.equal(a.id_usuario, b.id_usuario);
    assert.equal(await contar("usuario"), usuarios + 1);
    assert.equal(await contar("cuenta_social"), cuentas + 1);
});

test("no se pisan los datos del usuario al volver a ingresar con otro nombre", async () => {
    google.resultados.set("v1", perfil("google", "g-datos", "datos@example.com"));
    google.resultados.set(
        "v2",
        perfil("google", "g-datos", "otro.correo@example.com", { nombre: "Cambiado" })
    );

    const primero = await ingresar("google", "v1");
    const segundo = await ingresar("google", "v2");
    const { body } = await me(segundo.sesion);

    assert.equal(segundo.auth, "ok");
    assert.equal(body.id_usuario, (await me(primero.sesion)).body.id_usuario);
    assert.equal(body.nombre, "Ana");
    assert.equal(body.correo_electronico, "datos@example.com");
});

test("dos ingresos simultaneos de la misma identidad crean un solo usuario", async () => {
    google.resultados.set("carrera", perfil("google", "g-carrera", "carrera@example.com"));

    const usuarios = await contar("usuario");
    const cuentas = await contar("cuenta_social");
    const intentos = await Promise.all(
        Array.from({ length: 4 }, () => ingresar("google", "carrera"))
    );
    const ids = new Set();

    for (const intento of intentos) {
        assert.equal(intento.auth, "ok", intento.motivo);
        ids.add((await me(intento.sesion)).body.id_usuario);
    }

    assert.equal(ids.size, 1);
    assert.equal(await contar("usuario"), usuarios + 1);
    assert.equal(await contar("cuenta_social"), cuentas + 1);
});

test("un correo ya usado por otra identidad se rechaza sin vincular cuentas", async () => {
    google.resultados.set("base", perfil("google", "g-base", "compartido@example.com"));
    facebook.resultados.set(
        "mismo-correo",
        perfil("facebook", "f-mismo-correo", "compartido@example.com")
    );
    facebook.resultados.set(
        "mayusculas",
        perfil("facebook", "f-mayusculas", "  COMPARTIDO@Example.com ")
    );

    const original = await ingresar("google", "base");
    const usuarios = await contar("usuario");
    const cuentas = await contar("cuenta_social");

    for (const code of ["mismo-correo", "mayusculas"]) {
        const intento = await ingresar("facebook", code);

        assert.equal(intento.status, 302);
        assert.equal(intento.auth, "error");
        assert.equal(intento.motivo, "email_en_uso");
        assert.equal(intento.sesion, null);
    }

    assert.equal(await contar("usuario"), usuarios);
    assert.equal(await contar("cuenta_social"), cuentas);
    assert.equal(
        (await pool.query("SELECT 1 FROM cuenta_social WHERE id_proveedor LIKE 'f-m%'")).rowCount,
        0
    );
    assert.equal((await me(original.sesion)).status, 200);
});

test("dos identidades distintas con el mismo correo en simultaneo: solo una se registra", async () => {
    google.resultados.set("c-g", perfil("google", "g-conc", "concurrente@example.com"));
    facebook.resultados.set("c-f", perfil("facebook", "f-conc", "concurrente@example.com"));

    const usuarios = await contar("usuario");
    const intentos = await Promise.all([
        ingresar("google", "c-g"),
        ingresar("facebook", "c-f"),
    ]);

    assert.deepEqual(intentos.map((i) => i.auth).sort(), ["error", "ok"]);
    assert.equal(intentos.find((i) => i.auth === "error").motivo, "email_en_uso");
    assert.equal(await contar("usuario"), usuarios + 1);
});

// --- autenticaciones invalidas, correo ausente, cancelaciones --------------

test("Facebook sin correo no completa el registro", async () => {
    facebook.resultados.set("sin-correo", new ErrorAutenticacion("sin_email"));

    const usuarios = await contar("usuario");
    const intento = await ingresar("facebook", "sin-correo");

    assert.equal(intento.auth, "error");
    assert.equal(intento.motivo, "sin_email");
    assert.equal(intento.sesion, null);
    assert.equal(await contar("usuario"), usuarios);
});

test("un perfil sin correo o con datos invalidos no crea ningun usuario", async () => {
    const casos = {
        "perfil-sin-correo": [perfil("facebook", "f-x1", undefined), "sin_email"],
        "perfil-correo-vacio": [perfil("facebook", "f-x2", "  "), "sin_email"],
        "perfil-correo-malo": [perfil("facebook", "f-x3", "no-es-correo"), "datos_incompletos"],
        "perfil-sin-nombre": [perfil("facebook", "f-x4", "x4@example.com", { nombre: "" }), "datos_incompletos"],
        "perfil-sin-id": [perfil("facebook", "", "x5@example.com"), "datos_incompletos"],
    };

    for (const [code, [datos]] of Object.entries(casos)) {
        facebook.resultados.set(code, datos);
    }

    const usuarios = await contar("usuario");

    for (const [code, [, motivo]] of Object.entries(casos)) {
        const intento = await ingresar("facebook", code);

        assert.equal(intento.auth, "error", code);
        assert.equal(intento.motivo, motivo, code);
        assert.equal(intento.sesion, null, code);
    }

    assert.equal(await contar("usuario"), usuarios);
});

test("Google con correo no verificado se rechaza", async () => {
    google.resultados.set("no-verificado", new ErrorAutenticacion("email_no_verificado"));

    const intento = await ingresar("google", "no-verificado");

    assert.equal(intento.motivo, "email_no_verificado");
    assert.equal(intento.sesion, null);
});

test("un state ausente, alterado o ajeno se rechaza y el usuario sigue como invitado", async () => {
    google.resultados.set("estado", perfil("google", "g-estado", "estado@example.com"));
    facebook.resultados.set("estado", perfil("facebook", "f-estado", "estado@example.com"));

    const usuarios = await contar("usuario");
    const inicio = await iniciarFlujo("google");
    const otro = await iniciarFlujo("facebook");
    const [cabecera, carga, firma] = inicio.oauth.valor.split(".");
    const alterada = {
        ...inicio.oauth,
        par: `a360_oauth=${cabecera}.${carga}.${firma.slice(0, -2)}AA`,
    };
    const vencida = await new SignJWT({ proveedor: "google", state: inicio.state, nonce: "n", verificador: "v" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer("aventura360")
        .setAudience("aventura360:oauth")
        .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
        .sign(new TextEncoder().encode(configBase.sessionSecret));

    const casos = {
        "sin cookie": { consulta: { code: "estado", state: inicio.state }, oauth: null },
        "sin state": { consulta: { code: "estado" }, oauth: inicio.oauth },
        "state distinto": { consulta: { code: "estado", state: "otro" }, oauth: inicio.oauth },
        "state repetido": { consulta: new URLSearchParams([["code", "estado"], ["state", inicio.state], ["state", inicio.state]]), oauth: inicio.oauth },
        "cookie alterada": { consulta: { code: "estado", state: inicio.state }, oauth: alterada },
        "cookie vencida": { consulta: { code: "estado", state: inicio.state }, oauth: { par: `a360_oauth=${vencida}` } },
        "cookie de otro proveedor": { consulta: { code: "estado", state: inicio.state }, oauth: otro.oauth },
    };

    for (const [nombre, caso] of Object.entries(casos)) {
        const intento = await callback("google", caso);

        assert.equal(intento.auth, "error", nombre);
        assert.equal(intento.motivo, "estado_invalido", nombre);
        assert.equal(intento.sesion, null, nombre);
    }

    assert.equal(await contar("usuario"), usuarios);
});

test("la cancelacion y los errores del proveedor dejan al usuario como invitado", async () => {
    const usuarios = await contar("usuario");

    for (const [nombre, consulta, motivo] of [
        ["google", { error: "access_denied" }, "cancelado"],
        ["facebook", { error: "access_denied", error_reason: "user_denied" }, "cancelado"],
        ["google", { error: "server_error" }, "proveedor_error"],
        ["facebook", { error: "temporarily_unavailable", error_description: "algo" }, "proveedor_error"],
        ["google", {}, "proveedor_error"],
        ["google", { code: "" }, "proveedor_error"],
        ["google", { code: "codigo-inexistente" }, "proveedor_error"],
    ]) {
        const { oauth, state } = await iniciarFlujo(nombre);
        const intento = await callback(nombre, { consulta: { state, ...consulta }, oauth });

        assert.equal(intento.auth, "error", JSON.stringify(consulta));
        assert.equal(intento.motivo, motivo, JSON.stringify(consulta));
        assert.equal(intento.url.origin, FRONTEND);
        assert.equal(intento.sesion, null);
        assert.equal(leerCookie(intento.respuesta, "a360_oauth").valor, "");
    }

    assert.equal(await contar("usuario"), usuarios);
});

test("un fallo inesperado no filtra detalles y no autentica", async (t) => {
    t.mock.method(console, "error", () => {});
    google.resultados.set("fallo", new Error("falla interna token=SECRETO123 code=ABC"));

    const intento = await ingresar("google", "fallo");

    assert.equal(intento.auth, "error");
    assert.equal(intento.motivo, "proveedor_error");
    assert.equal(intento.sesion, null);
    assert.ok(!intento.url.toString().includes("SECRETO123"));
    assert.ok(!JSON.stringify(intento.respuesta.headers.getSetCookie()).includes("SECRETO123"));
});

test("un proveedor desconocido responde 404 y uno sin configurar redirige como no disponible", async () => {
    for (const ruta of ["twitter", "twitter/callback", "__proto__", "Google"]) {
        const respuesta = await fetch(`${principal}/api/auth/${ruta}`, { redirect: "manual" });

        assert.equal(respuesta.status, 404, ruta);
        assert.deepEqual(await respuesta.json(), { errores: ["Proveedor no soportado."] });
    }

    const sinFacebook = await levantar({
        config: { ...configBase, facebook: null },
        proveedores: { google },
    });
    const sinSecreto = await levantar({
        config: { ...configBase, sessionSecret: null },
        proveedores: { google, facebook },
    });

    for (const [base, nombre] of [[sinFacebook, "facebook"], [sinSecreto, "google"]]) {
        const inicio = await iniciarFlujo(nombre, { base });
        const fin = await callback(nombre, { base, consulta: { code: "x", state: "y" }, oauth: null });

        assert.equal(resultado(inicio.respuesta).motivo, "no_disponible");
        assert.equal(inicio.oauth, null);
        assert.equal(fin.motivo, "no_disponible");
        assert.equal(fin.sesion, null);
    }
});

test("quien ya esta autenticado no puede iniciar otro registro", async () => {
    google.resultados.set("ya", perfil("google", "g-ya", "ya@example.com"));

    const fin = await ingresar("google", "ya");
    const usuarios = await contar("usuario");
    const inicio = await iniciarFlujo("facebook", { cookies: fin.sesion.par });

    assert.equal(resultado(inicio.respuesta).motivo, "ya_autenticado");
    assert.equal(inicio.oauth, null);
    assert.equal(await contar("usuario"), usuarios);
});

// --- /api/auth/me ----------------------------------------------------------

test("/me responde 401 sin sesion o con una sesion invalida", async () => {
    google.resultados.set("me", perfil("google", "g-me", "me@example.com"));

    const fin = await ingresar("google", "me");
    const valor = fin.sesion.valor;
    const sesiones = {
        "sin cookie": null,
        "cookie basura": { par: "a360_sesion=basura" },
        alterada: { par: `a360_sesion=${valor.slice(0, -2)}AA` },
        vacia: { par: "a360_sesion=" },
    };

    for (const [nombre, sesion] of Object.entries(sesiones)) {
        const { status, body } = await me(sesion);

        assert.equal(status, 401, nombre);
        assert.deepEqual(body, { errores: ["No autenticado."] }, nombre);
    }

    assert.equal((await me(fin.sesion)).status, 200);

    // Una cookie de estado de OAuth no autentica.
    const inicio = await iniciarFlujo("google");

    assert.equal((await me({ par: `a360_sesion=${inicio.oauth.valor}` })).status, 401);

    // Un usuario eliminado deja de estar autenticado aunque la cookie sea valida.
    await pool.query("DELETE FROM cuenta_social WHERE id_proveedor = 'g-me'");
    await pool.query("DELETE FROM usuario WHERE correo_electronico = 'me@example.com'");

    assert.equal((await me(fin.sesion)).status, 401);
});

test("la cookie de sesion lleva Secure cuando la configuracion lo indica", async () => {
    google.resultados.set("segura", perfil("google", "g-segura", "segura@example.com"));

    const base = await levantar({
        config: { ...configBase, cookieSegura: true },
        proveedores: { google },
    });
    const inicio = await iniciarFlujo("google", { base });

    assert.ok(inicio.oauth.atributos.includes("secure"));

    const fin = await callback("google", {
        base,
        consulta: { code: "segura", state: inicio.state },
        oauth: inicio.oauth,
    });

    assert.ok(fin.sesion.atributos.includes("secure"));
    assert.ok(fin.sesion.atributos.includes("httponly"));
});

// --- CORS ------------------------------------------------------------------

test("CORS de /api/auth admite solo el origen del frontend con credenciales", async () => {
    const permitido = await fetch(`${principal}/api/auth/me`, {
        headers: { Origin: FRONTEND },
    });

    assert.equal(permitido.headers.get("access-control-allow-origin"), FRONTEND);
    assert.equal(permitido.headers.get("access-control-allow-credentials"), "true");

    const ajeno = await fetch(`${principal}/api/auth/me`, {
        headers: { Origin: "https://evil.example" },
    });

    assert.equal(ajeno.headers.get("access-control-allow-origin"), FRONTEND);
    assert.notEqual(ajeno.headers.get("access-control-allow-origin"), "https://evil.example");

    const preflight = await fetch(`${principal}/api/auth/me`, {
        method: "OPTIONS",
        headers: { Origin: FRONTEND, "Access-Control-Request-Method": "GET" },
    });

    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");
});

test("el CORS del resto de la API no cambia", async () => {
    const respuesta = await fetch(`${principal}/api/health`, {
        headers: { Origin: "https://otro.example" },
    });

    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.headers.get("access-control-allow-origin"), "*");
    assert.equal(respuesta.headers.get("access-control-allow-credentials"), null);
});

// --- base de datos ---------------------------------------------------------

test("la base de datos aplica por si sola sus restricciones", async () => {
    const usuario = (valores) =>
        pool.query(
            `INSERT INTO usuario (nombre, apellido, correo_electronico, rol)
             VALUES ($1, $2, $3, $4) RETURNING id_usuario`,
            valores
        );
    const cuenta = (valores) =>
        pool.query(
            `INSERT INTO cuenta_social (id_usuario, proveedor, id_proveedor)
             VALUES ($1, $2, $3)`,
            valores
        );

    await assert.rejects(usuario(["Ana", null, "db1@example.com", "superadmin"]), { code: "23514" });
    await assert.rejects(usuario(["  ", null, "db2@example.com", "cliente"]), { code: "23514" });
    await assert.rejects(usuario(["Ana", "  ", "db3@example.com", "cliente"]), { code: "23514" });
    await assert.rejects(usuario(["Ana", null, "  ", "cliente"]), { code: "23514" });
    await assert.rejects(usuario(["Ana", null, null, "cliente"]), { code: "23502" });

    const { rows: [a] } = await usuario(["Ana", null, "DB@Example.com", "administrador"]);
    const { rows: [predeterminado] } = await pool.query(
        "INSERT INTO usuario (nombre, correo_electronico) VALUES ('Sin rol', 'db-sin-rol@example.com') RETURNING rol"
    );

    assert.equal(predeterminado.rol, "cliente");
    await assert.rejects(usuario(["Otra", null, " db@example.COM ", "cliente"]), { code: "23505" });

    const { rows: [b] } = await usuario(["Beto", null, "db-b@example.com", "cliente"]);

    await assert.rejects(cuenta([a.id_usuario, "twitter", "1"]), { code: "23514" });
    await assert.rejects(cuenta([a.id_usuario, "google", "  "]), { code: "23514" });
    await assert.rejects(cuenta([999999, "google", "1"]), { code: "23503" });

    await cuenta([a.id_usuario, "google", "db-g"]);
    // La estructura admite vincular Google y Facebook a un mismo usuario...
    await cuenta([a.id_usuario, "facebook", "db-f"]);
    // ...pero una identidad pertenece a un unico usuario...
    await assert.rejects(cuenta([b.id_usuario, "google", "db-g"]), { code: "23505" });
    // ...y un usuario no repite proveedor.
    await assert.rejects(cuenta([a.id_usuario, "google", "db-g2"]), { code: "23505" });
});
