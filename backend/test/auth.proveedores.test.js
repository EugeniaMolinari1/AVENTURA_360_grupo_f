const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const {
    generateKeyPair,
    exportJWK,
    createLocalJWKSet,
    SignJWT,
} = require("jose");
const { crearProveedorGoogle } = require("../src/services/auth/google");
const { crearProveedorFacebook } = require("../src/services/auth/facebook");
const { ErrorAutenticacion } = require("../src/services/auth/errores");

// Estas pruebas verifican la logica propia (firma, emisor, audiencia,
// vencimiento, nonce, correo) con claves generadas aqui. NO prueban que Google
// o Facebook acepten realmente las credenciales y redirecciones del proyecto:
// eso requiere la verificacion manual con los proveedores reales.

const CLIENT_ID = "cliente-de-prueba.apps.googleusercontent.com";
const CLIENT_SECRET = "secreto-de-prueba-google";
const REDIRECT_GOOGLE = "http://localhost:3001/api/auth/google/callback";
const NONCE = "nonce-de-prueba";

let clavePrivada;
let otraClavePrivada;
let claves;

before(async () => {
    const par = await generateKeyPair("RS256");
    const otro = await generateKeyPair("RS256");

    clavePrivada = par.privateKey;
    otraClavePrivada = otro.privateKey;
    claves = createLocalJWKSet({
        keys: [
            {
                ...(await exportJWK(par.publicKey)),
                kid: "k1",
                alg: "RS256",
                use: "sig",
            },
        ],
    });
});

const respuesta = (cuerpo, ok = true) => ({
    ok,
    json: async () => cuerpo,
});

async function idToken({
    claims = {},
    emisor = "https://accounts.google.com",
    audiencia = CLIENT_ID,
    expira = "5m",
    clave = clavePrivada,
} = {}) {
    return new SignJWT({
        sub: "1234567890",
        email: "ana@example.com",
        email_verified: true,
        given_name: "Ana",
        family_name: "Perez",
        name: "Ana Perez",
        nonce: NONCE,
        ...claims,
    })
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(emisor)
        .setAudience(audiencia)
        .setIssuedAt()
        .setExpirationTime(expira)
        .sign(clave);
}

function googleCon(respuestaToken) {
    const llamadas = [];
    const proveedor = crearProveedorGoogle(
        { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
        REDIRECT_GOOGLE,
        {
            claves,
            fetchFn: async (url, opciones) => {
                llamadas.push({ url, opciones });
                return respuestaToken;
            },
        }
    );

    return { proveedor, llamadas };
}

const completarGoogle = (proveedor) =>
    proveedor.completar({
        code: "codigo",
        codigoVerificador: "verificador",
        nonce: NONCE,
    });

const esperaMotivo = (motivo) => (error) =>
    error instanceof ErrorAutenticacion && error.motivo === motivo;

test("Google: la URL de autorizacion usa codigo, PKCE, state y nonce, sin secretos", () => {
    const { proveedor } = googleCon(respuesta({}));
    const url = new URL(
        proveedor.iniciar({
            state: "estado",
            nonce: "nonce",
            codeChallenge: "desafio",
        })
    );
    const parametros = url.searchParams;

    assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(parametros.get("client_id"), CLIENT_ID);
    assert.equal(parametros.get("redirect_uri"), REDIRECT_GOOGLE);
    assert.equal(parametros.get("response_type"), "code");
    assert.equal(parametros.get("scope"), "openid email profile");
    assert.equal(parametros.get("state"), "estado");
    assert.equal(parametros.get("nonce"), "nonce");
    assert.equal(parametros.get("code_challenge"), "desafio");
    assert.equal(parametros.get("code_challenge_method"), "S256");
    assert.ok(!url.toString().includes(CLIENT_SECRET));
});

test("Google: acepta un ID token valido y devuelve la identidad verificada", async () => {
    const { proveedor, llamadas } = googleCon(
        respuesta({ id_token: await idToken() })
    );

    assert.deepEqual(await completarGoogle(proveedor), {
        proveedor: "google",
        id_proveedor: "1234567890",
        nombre: "Ana",
        apellido: "Perez",
        correo_electronico: "ana@example.com",
    });

    // El secreto solo viaja al endpoint de tokens de Google, por POST.
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].url, "https://oauth2.googleapis.com/token");
    assert.equal(llamadas[0].opciones.method, "POST");
    const cuerpo = llamadas[0].opciones.body;
    assert.equal(cuerpo.get("client_secret"), CLIENT_SECRET);
    assert.equal(cuerpo.get("code_verifier"), "verificador");
    assert.equal(cuerpo.get("grant_type"), "authorization_code");
    assert.equal(cuerpo.get("redirect_uri"), REDIRECT_GOOGLE);
});

test("Google: acepta el emisor sin esquema y email_verified como texto", async () => {
    const { proveedor } = googleCon(
        respuesta({
            id_token: await idToken({
                emisor: "accounts.google.com",
                claims: { email_verified: "true" },
            }),
        })
    );

    assert.equal((await completarGoogle(proveedor)).id_proveedor, "1234567890");
});

test("Google: rechaza ID tokens invalidos", async () => {
    const casos = {
        "audiencia ajena": await idToken({ audiencia: "otra-app" }),
        "emisor ajeno": await idToken({ emisor: "https://evil.example.com" }),
        vencido: await idToken({ expira: Math.floor(Date.now() / 1000) - 120 }),
        "nonce distinto": await idToken({ claims: { nonce: "otro" } }),
        "sin nonce": await idToken({ claims: { nonce: undefined } }),
        "firmado con otra clave": await idToken({ clave: otraClavePrivada }),
        "sin sub": await idToken({ claims: { sub: undefined } }),
        "no es un JWT": "texto-cualquiera",
    };

    for (const [nombre, token] of Object.entries(casos)) {
        const { proveedor } = googleCon(respuesta({ id_token: token }));

        await assert.rejects(
            completarGoogle(proveedor),
            esperaMotivo("proveedor_error"),
            nombre
        );
    }
});

test("Google: rechaza respuestas del endpoint de tokens sin id_token o con error", async () => {
    for (const r of [
        respuesta({}),
        respuesta({ id_token: 123 }),
        respuesta({ error: "invalid_grant" }, false),
    ]) {
        await assert.rejects(
            completarGoogle(googleCon(r).proveedor),
            esperaMotivo("proveedor_error")
        );
    }
});

test("Google: exige correo presente y verificado", async () => {
    const sinCorreo = googleCon(
        respuesta({ id_token: await idToken({ claims: { email: undefined } }) })
    );
    await assert.rejects(
        completarGoogle(sinCorreo.proveedor),
        esperaMotivo("sin_email")
    );

    for (const verificado of [false, "false", undefined, 1]) {
        const { proveedor } = googleCon(
            respuesta({
                id_token: await idToken({
                    claims: { email_verified: verificado },
                }),
            })
        );

        await assert.rejects(
            completarGoogle(proveedor),
            esperaMotivo("email_no_verificado"),
            String(verificado)
        );
    }
});

const APP_ID = "app-de-prueba";
const APP_SECRET = "secreto-de-prueba-facebook";
const REDIRECT_FACEBOOK = "http://localhost:3001/api/auth/facebook/callback";

function facebookCon({ token, perfil }) {
    const llamadas = [];
    const proveedor = crearProveedorFacebook(
        { appId: APP_ID, appSecret: APP_SECRET, graphVersion: "v23.0" },
        REDIRECT_FACEBOOK,
        {
            fetchFn: async (url) => {
                llamadas.push(new URL(url));

                return url.includes("/oauth/access_token") ? token : perfil;
            },
        }
    );

    return { proveedor, llamadas };
}

const tokenValido = () => respuesta({ access_token: "token-de-facebook" });
const perfilValido = (extra = {}) =>
    respuesta({
        id: "9876543210",
        first_name: "Beto",
        last_name: "Gomez",
        name: "Beto Gomez",
        email: "beto@example.com",
        ...extra,
    });

test("Facebook: la URL de autorizacion pide solo perfil y correo, sin secretos", () => {
    const { proveedor } = facebookCon({});
    const url = new URL(proveedor.iniciar({ state: "estado" }));

    assert.equal(url.origin + url.pathname, "https://www.facebook.com/v23.0/dialog/oauth");
    assert.equal(url.searchParams.get("client_id"), APP_ID);
    assert.equal(url.searchParams.get("redirect_uri"), REDIRECT_FACEBOOK);
    assert.equal(url.searchParams.get("scope"), "public_profile,email");
    assert.equal(url.searchParams.get("state"), "estado");
    assert.ok(!url.toString().includes(APP_SECRET));
});

test("Facebook: obtiene la identidad desde Graph API con appsecret_proof", async () => {
    const { proveedor, llamadas } = facebookCon({
        token: tokenValido(),
        perfil: perfilValido(),
    });

    assert.deepEqual(await proveedor.completar({ code: "codigo" }), {
        proveedor: "facebook",
        id_proveedor: "9876543210",
        nombre: "Beto",
        apellido: "Gomez",
        correo_electronico: "beto@example.com",
    });

    assert.equal(llamadas.length, 2);
    assert.equal(llamadas[0].origin, "https://graph.facebook.com");
    assert.equal(llamadas[0].searchParams.get("code"), "codigo");
    assert.equal(llamadas[0].searchParams.get("client_secret"), APP_SECRET);
    assert.equal(llamadas[1].pathname, "/v23.0/me");
    assert.equal(llamadas[1].searchParams.get("access_token"), "token-de-facebook");
    assert.equal(
        llamadas[1].searchParams.get("appsecret_proof"),
        createHmac("sha256", APP_SECRET).update("token-de-facebook").digest("hex")
    );
    assert.ok(!llamadas[1].toString().includes(APP_SECRET));
});

test("Facebook: usa name si no hay first_name y deja el apellido en null", async () => {
    const { proveedor } = facebookCon({
        token: tokenValido(),
        perfil: perfilValido({ first_name: undefined, last_name: undefined }),
    });

    const perfil = await proveedor.completar({ code: "codigo" });

    assert.equal(perfil.nombre, "Beto Gomez");
    assert.equal(perfil.apellido, null);
});

test("Facebook: sin correo no completa el registro ni inventa datos", async () => {
    for (const email of [undefined, null, "", "   "]) {
        const { proveedor } = facebookCon({
            token: tokenValido(),
            perfil: perfilValido({ email }),
        });

        await assert.rejects(
            proveedor.completar({ code: "codigo" }),
            esperaMotivo("sin_email"),
            String(email)
        );
    }
});

test("Facebook: rechaza errores del proveedor y respuestas incompletas", async () => {
    const casos = [
        { token: respuesta({ error: {} }, false), perfil: perfilValido() },
        { token: respuesta({}), perfil: perfilValido() },
        { token: tokenValido(), perfil: respuesta({}, false) },
        { token: tokenValido(), perfil: perfilValido({ id: undefined }) },
        { token: tokenValido(), perfil: perfilValido({ id: 123 }) },
    ];

    for (const caso of casos) {
        await assert.rejects(
            facebookCon(caso).proveedor.completar({ code: "codigo" }),
            esperaMotivo("proveedor_error")
        );
    }
});
