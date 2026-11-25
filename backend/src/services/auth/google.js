const { jwtVerify, createRemoteJWKSet } = require("jose");
const { ErrorAutenticacion } = require("./errores");

const URL_AUTORIZACION = "https://accounts.google.com/o/oauth2/v2/auth";
const URL_TOKEN = "https://oauth2.googleapis.com/token";
const URL_CLAVES = "https://www.googleapis.com/oauth2/v3/certs";
const EMISORES = ["https://accounts.google.com", "accounts.google.com"];
const TIMEOUT_MS = 10000;

// fetchFn y claves se pueden reemplazar en las pruebas. Por defecto se usan
// fetch y las claves publicas de Google, con las que se verifica la firma.
function crearProveedorGoogle(
    config,
    redirectUri,
    { fetchFn = fetch, claves = createRemoteJWKSet(new URL(URL_CLAVES)) } = {}
) {
    function iniciar({ state, nonce, codeChallenge }) {
        const url = new URL(URL_AUTORIZACION);

        url.search = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: redirectUri,
            response_type: "code",
            scope: "openid email profile",
            state,
            nonce,
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
            prompt: "select_account",
        }).toString();

        return url.toString();
    }

    async function completar({ code, codigoVerificador, nonce }) {
        // El intercambio usa client_secret: solo ocurre en el servidor.
        const respuesta = await fetchFn(URL_TOKEN, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: config.clientId,
                client_secret: config.clientSecret,
                redirect_uri: redirectUri,
                grant_type: "authorization_code",
                code_verifier: codigoVerificador,
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (!respuesta.ok) throw new ErrorAutenticacion("proveedor_error");

        const { id_token: idToken } = await respuesta.json();

        if (typeof idToken !== "string") {
            throw new ErrorAutenticacion("proveedor_error");
        }

        let datos;

        try {
            ({ payload: datos } = await jwtVerify(idToken, claves, {
                issuer: EMISORES,
                audience: config.clientId,
                algorithms: ["RS256"],
            }));
        } catch {
            throw new ErrorAutenticacion("proveedor_error");
        }

        // Vincula el token con esta peticion de inicio de sesion.
        if (datos.nonce !== nonce || typeof datos.sub !== "string" || !datos.sub) {
            throw new ErrorAutenticacion("proveedor_error");
        }

        if (typeof datos.email !== "string" || !datos.email) {
            throw new ErrorAutenticacion("sin_email");
        }

        if (datos.email_verified !== true && datos.email_verified !== "true") {
            throw new ErrorAutenticacion("email_no_verificado");
        }

        return {
            proveedor: "google",
            id_proveedor: datos.sub,
            nombre: datos.given_name || datos.name,
            apellido: datos.family_name || null,
            correo_electronico: datos.email,
        };
    }

    return { iniciar, completar };
}

module.exports = { crearProveedorGoogle };
