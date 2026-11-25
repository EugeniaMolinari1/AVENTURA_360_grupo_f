const MIN_LARGO_SECRETO = 32;

function quitarBarraFinal(valor) {
    return valor.replace(/\/+$/, "");
}

// Lee la configuracion de autenticacion desde el entorno. No lanza errores si
// faltan variables: lo que no este configurado queda deshabilitado (null) y
// el resto de la API sigue funcionando.
function leerConfiguracionAuth(env = process.env) {
    const frontendUrl = quitarBarraFinal(
        env.FRONTEND_URL || "http://localhost:5173"
    );

    return {
        backendUrl: quitarBarraFinal(
            env.BACKEND_URL || `http://localhost:${env.PORT || 3001}`
        ),
        frontendUrl,
        frontendOrigin: new URL(frontendUrl).origin,
        sessionSecret:
            env.SESSION_SECRET && env.SESSION_SECRET.length >= MIN_LARGO_SECRETO
                ? env.SESSION_SECRET
                : null,
        cookieSegura: env.NODE_ENV === "production",
        google:
            env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
                ? {
                    clientId: env.GOOGLE_CLIENT_ID,
                    clientSecret: env.GOOGLE_CLIENT_SECRET,
                }
                : null,
        facebook:
            env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET
                ? {
                    appId: env.FACEBOOK_APP_ID,
                    appSecret: env.FACEBOOK_APP_SECRET,
                    graphVersion: env.FACEBOOK_GRAPH_VERSION || "v23.0",
                }
                : null,
    };
}

// Avisa al iniciar el servidor que parte de la autenticacion no esta lista.
function advertirConfiguracionAuth(config) {
    if (!config.sessionSecret) {
        console.warn(
            `Autenticacion deshabilitada: SESSION_SECRET debe tener al menos ${MIN_LARGO_SECRETO} caracteres.`
        );
    }

    for (const proveedor of ["google", "facebook"]) {
        if (!config[proveedor]) {
            console.warn(
                `Inicio de sesion con ${proveedor} deshabilitado: faltan sus credenciales en .env.`
            );
        }
    }
}

module.exports = { leerConfiguracionAuth, advertirConfiguracionAuth };
