const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SignJWT } = require("jose");
const {
    firmarSesion,
    leerSesion,
    firmarEstadoOAuth,
    leerEstadoOAuth,
    opcionesCookie,
} = require("../src/services/sesion.service");
const {
    validarPerfil,
    normalizarPerfil,
    leerCodigo,
    esProveedorPermitido,
} = require("../src/validators/auth.validator");
const { leerConfiguracionAuth } = require("../src/config/auth");

const config = { sessionSecret: "s".repeat(48), cookieSegura: false };
const clave = (secreto) => new TextEncoder().encode(secreto);

test("la sesion firmada se lee y solo contiene el identificador de usuario", async () => {
    const token = await firmarSesion(config, 42);

    assert.equal(await leerSesion(config, token), 42);

    const carga = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString()
    );
    assert.deepEqual(Object.keys(carga).sort(), ["aud", "exp", "iat", "iss", "sub"]);
    assert.ok(carga.exp - carga.iat === 7 * 24 * 60 * 60);
});

test("la sesion se rechaza si esta alterada, vencida, mal firmada o es de otro tipo", async () => {
    const valida = await firmarSesion(config, 42);
    const [cabecera, carga, firma] = valida.split(".");
    const otraCarga = Buffer.from(
        JSON.stringify({
            ...JSON.parse(Buffer.from(carga, "base64url").toString()),
            sub: "1",
        })
    ).toString("base64url");
    const firmar = (secreto, extras = {}) => {
        let jwt = new SignJWT({})
            .setProtectedHeader({ alg: "HS256" })
            .setSubject("42")
            .setIssuer("aventura360")
            .setAudience("aventura360:sesion")
            .setIssuedAt();

        jwt = extras.expiracion
            ? jwt.setExpirationTime(extras.expiracion)
            : jwt.setExpirationTime("1h");

        return jwt.sign(clave(secreto));
    };

    const invalidos = {
        alterada: `${cabecera}.${otraCarga}.${firma}`,
        "otro secreto": await firmar("x".repeat(48)),
        vencida: await firmar(config.sessionSecret, {
            expiracion: Math.floor(Date.now() / 1000) - 60,
        }),
        "estado de OAuth usado como sesion": await firmarEstadoOAuth(config, {
            proveedor: "google",
        }),
        "algoritmo none": `${Buffer.from('{"alg":"none"}').toString("base64url")}.${carga}.`,
        "sub no numerico": await new SignJWT({})
            .setProtectedHeader({ alg: "HS256" })
            .setSubject("abc")
            .setIssuer("aventura360")
            .setAudience("aventura360:sesion")
            .setExpirationTime("1h")
            .sign(clave(config.sessionSecret)),
        vacia: "",
        undefined,
        numero: 5,
    };

    for (const [nombre, token] of Object.entries(invalidos)) {
        assert.equal(await leerSesion(config, token), null, nombre);
    }

    // Sin secreto configurado nada se considera valido.
    assert.equal(await leerSesion({ sessionSecret: null }, valida), null);
});

test("el estado de OAuth no sirve como sesion ni la sesion como estado", async () => {
    const estado = await firmarEstadoOAuth(config, {
        proveedor: "facebook",
        state: "abc",
    });
    const leido = await leerEstadoOAuth(config, estado);

    assert.equal(leido.proveedor, "facebook");
    assert.equal(leido.state, "abc");
    assert.equal(leido.exp - leido.iat, 10 * 60);
    assert.equal(await leerEstadoOAuth(config, await firmarSesion(config, 1)), null);
});

test("las cookies son HttpOnly y SameSite=Lax, y Secure segun la configuracion", () => {
    assert.deepEqual(opcionesCookie(config, "/"), {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/",
    });
    assert.equal(opcionesCookie({ ...config, cookieSegura: true }, "/").secure, true);
});

const perfil = (extra = {}) => ({
    proveedor: "google",
    id_proveedor: "123",
    nombre: "  Ana   Maria ",
    apellido: " Perez ",
    correo_electronico: "  Ana@Example.COM ",
    ...extra,
});

test("validarPerfil acepta un perfil completo y rechaza los incompletos", () => {
    assert.equal(validarPerfil(perfil()), null);
    assert.equal(validarPerfil(perfil({ apellido: null })), null);

    const casos = [
        [null, "datos_incompletos"],
        ["texto", "datos_incompletos"],
        [perfil({ proveedor: "twitter" }), "datos_incompletos"],
        [perfil({ id_proveedor: "  " }), "datos_incompletos"],
        [perfil({ id_proveedor: undefined }), "datos_incompletos"],
        [perfil({ nombre: "" }), "datos_incompletos"],
        [perfil({ nombre: undefined }), "datos_incompletos"],
        [perfil({ correo_electronico: undefined }), "sin_email"],
        [perfil({ correo_electronico: "   " }), "sin_email"],
        [perfil({ correo_electronico: "sin-arroba" }), "datos_incompletos"],
        [perfil({ correo_electronico: "a b@c.com" }), "datos_incompletos"],
        [perfil({ correo_electronico: `${"a".repeat(250)}@x.com` }), "datos_incompletos"],
    ];

    for (const [entrada, motivo] of casos) {
        assert.equal(validarPerfil(entrada), motivo, JSON.stringify(entrada));
    }
});

test("normalizarPerfil limpia espacios, pasa el correo a minusculas y no agrega campos", () => {
    assert.deepEqual(normalizarPerfil(perfil({ rol: "administrador" })), {
        proveedor: "google",
        id_proveedor: "123",
        nombre: "Ana Maria",
        apellido: "Perez",
        correo_electronico: "ana@example.com",
    });
    assert.equal(normalizarPerfil(perfil({ apellido: "  " })).apellido, null);
    assert.equal(normalizarPerfil(perfil({ nombre: "n".repeat(300) })).nombre.length, 100);
});

test("leerCodigo y esProveedorPermitido solo aceptan valores esperados", () => {
    assert.equal(leerCodigo({ code: "abc" }), "abc");

    for (const query of [undefined, {}, { code: "" }, { code: ["a", "b"] }, { code: { a: 1 } }, { code: "x".repeat(2049) }]) {
        assert.equal(leerCodigo(query), null);
    }

    assert.ok(esProveedorPermitido("google"));
    assert.ok(esProveedorPermitido("facebook"));

    for (const valor of ["twitter", "Google", "__proto__", "", undefined, ["google"]]) {
        assert.ok(!esProveedorPermitido(valor), String(valor));
    }
});

test("la configuracion deshabilita lo que no tiene credenciales o secreto suficiente", () => {
    const vacia = leerConfiguracionAuth({});

    assert.equal(vacia.sessionSecret, null);
    assert.equal(vacia.google, null);
    assert.equal(vacia.facebook, null);
    assert.equal(vacia.cookieSegura, false);
    assert.equal(vacia.frontendOrigin, "http://localhost:5173");
    assert.equal(vacia.backendUrl, "http://localhost:3001");

    assert.equal(leerConfiguracionAuth({ SESSION_SECRET: "corto" }).sessionSecret, null);
    assert.equal(leerConfiguracionAuth({ GOOGLE_CLIENT_ID: "solo-id" }).google, null);

    const completa = leerConfiguracionAuth({
        SESSION_SECRET: "s".repeat(32),
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secreto",
        FACEBOOK_APP_ID: "app",
        FACEBOOK_APP_SECRET: "secreto",
        NODE_ENV: "production",
        FRONTEND_URL: "https://tienda.example.com/",
        BACKEND_URL: "https://api.example.com/",
    });

    assert.equal(completa.cookieSegura, true);
    assert.equal(completa.frontendUrl, "https://tienda.example.com");
    assert.equal(completa.frontendOrigin, "https://tienda.example.com");
    assert.equal(completa.backendUrl, "https://api.example.com");
    assert.deepEqual(completa.google, { clientId: "id", clientSecret: "secreto" });
    assert.equal(completa.facebook.graphVersion, "v23.0");
});
