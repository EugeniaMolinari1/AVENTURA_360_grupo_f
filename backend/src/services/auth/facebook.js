const { createHmac } = require("node:crypto");
const { ErrorAutenticacion } = require("./errores");

const TIMEOUT_MS = 10000;

function crearProveedorFacebook(config, redirectUri, { fetchFn = fetch } = {}) {
    const graph = `https://graph.facebook.com/${config.graphVersion}`;

    function iniciar({ state }) {
        const url = new URL(
            `https://www.facebook.com/${config.graphVersion}/dialog/oauth`
        );

        url.search = new URLSearchParams({
            client_id: config.appId,
            redirect_uri: redirectUri,
            response_type: "code",
            scope: "public_profile,email",
            state,
        }).toString();

        return url.toString();
    }

    async function pedirJson(url) {
        const respuesta = await fetchFn(url, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (!respuesta.ok) throw new ErrorAutenticacion("proveedor_error");

        return respuesta.json();
    }

    async function completar({ code }) {
        // El token se obtiene directamente de Facebook con el secreto de la
        // aplicacion: solo ocurre en el servidor.
        const token = await pedirJson(
            `${graph}/oauth/access_token?${new URLSearchParams({
                client_id: config.appId,
                client_secret: config.appSecret,
                redirect_uri: redirectUri,
                code,
            })}`
        );

        if (typeof token.access_token !== "string" || !token.access_token) {
            throw new ErrorAutenticacion("proveedor_error");
        }

        const perfil = await pedirJson(
            `${graph}/me?${new URLSearchParams({
                fields: "id,first_name,last_name,name,email",
                access_token: token.access_token,
                appsecret_proof: createHmac("sha256", config.appSecret)
                    .update(token.access_token)
                    .digest("hex"),
            })}`
        );

        if (typeof perfil.id !== "string" || !perfil.id) {
            throw new ErrorAutenticacion("proveedor_error");
        }

        // Facebook puede no entregar el correo: no se inventa ni se completa el registro.
        if (typeof perfil.email !== "string" || !perfil.email.trim()) {
            throw new ErrorAutenticacion("sin_email");
        }

        return {
            proveedor: "facebook",
            id_proveedor: perfil.id,
            nombre: perfil.first_name || perfil.name,
            apellido: perfil.last_name || null,
            correo_electronico: perfil.email,
        };
    }

    return { iniciar, completar };
}

module.exports = { crearProveedorFacebook };
