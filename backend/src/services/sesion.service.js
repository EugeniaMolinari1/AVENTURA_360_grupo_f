const { SignJWT, jwtVerify } = require("jose");

const COOKIE_SESION = "a360_sesion";
const COOKIE_OAUTH = "a360_oauth";
const DIAS_SESION = 7;
const MINUTOS_OAUTH = 10;
const EMISOR = "aventura360";
// Audiencias distintas: una cookie de OAuth no sirve como sesion ni al reves.
const AUDIENCIA_SESION = "aventura360:sesion";
const AUDIENCIA_OAUTH = "aventura360:oauth";

const clave = (config) => new TextEncoder().encode(config.sessionSecret);

async function verificar(config, token, audiencia) {
    if (typeof token !== "string" || !token || !config.sessionSecret) {
        return null;
    }

    try {
        const { payload } = await jwtVerify(token, clave(config), {
            issuer: EMISOR,
            audience: audiencia,
            algorithms: ["HS256"],
        });

        return payload;
    } catch {
        return null;
    }
}

// El token solo identifica al usuario; el rol y los datos se leen de la base.
function firmarSesion(config, idUsuario) {
    return new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(String(idUsuario))
        .setIssuer(EMISOR)
        .setAudience(AUDIENCIA_SESION)
        .setIssuedAt()
        .setExpirationTime(`${DIAS_SESION}d`)
        .sign(clave(config));
}

async function leerSesion(config, token) {
    const payload = await verificar(config, token, AUDIENCIA_SESION);

    if (!payload || !/^[1-9]\d{0,9}$/.test(payload.sub ?? "")) return null;

    return Number(payload.sub);
}

function firmarEstadoOAuth(config, datos) {
    return new SignJWT(datos)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer(EMISOR)
        .setAudience(AUDIENCIA_OAUTH)
        .setIssuedAt()
        .setExpirationTime(`${MINUTOS_OAUTH}m`)
        .sign(clave(config));
}

function leerEstadoOAuth(config, token) {
    return verificar(config, token, AUDIENCIA_OAUTH);
}

function opcionesCookie(config, path) {
    return {
        httpOnly: true,
        sameSite: "lax",
        secure: config.cookieSegura,
        path,
    };
}

module.exports = {
    COOKIE_SESION,
    COOKIE_OAUTH,
    DIAS_SESION,
    MINUTOS_OAUTH,
    firmarSesion,
    leerSesion,
    firmarEstadoOAuth,
    leerEstadoOAuth,
    opcionesCookie,
};
