import { useEffect, useState } from "react";
import "./AccesoRedSocial.css";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

const MENSAJES_ERROR = {
    cancelado: "Cancelaste el proceso en la red social.",
    estado_invalido:
        "No se pudo validar la solicitud de autenticación. Intentá nuevamente.",
    sin_email:
        "La red social no compartió tu correo electrónico, que es obligatorio para registrarte.",
    email_no_verificado:
        "El correo electrónico de tu cuenta no está verificado en la red social.",
    email_en_uso:
        "Ese correo electrónico ya está asociado a otra cuenta de Aventura 360.",
    datos_incompletos:
        "La red social no entregó los datos necesarios para completar el registro.",
    proveedor_error:
        "No se pudo completar la autenticación con la red social. Intentá nuevamente.",
    no_disponible:
        "El registro con esta red social no está disponible en este momento.",
    ya_autenticado: "Ya iniciaste sesión.",
};

const MENSAJE_GENERICO = "No se pudo completar el registro.";

// Lee el resultado que el backend deja en la URL al volver de la red social.
function leerResultadoDeLaUrl() {
    const parametros = new URLSearchParams(window.location.search);
    const auth = parametros.get("auth");

    if (auth !== "ok" && auth !== "error") return null;

    return { auth, motivo: parametros.get("motivo") };
}

export default function AccesoRedSocial() {
    const [resultado] = useState(leerResultadoDeLaUrl);
    const [estado, setEstado] = useState("cargando");
    const [usuario, setUsuario] = useState(null);

    // Quita los parámetros de la URL para que no se repita el mensaje al recargar.
    useEffect(() => {
        if (resultado) {
            window.history.replaceState(null, "", window.location.pathname);
        }
    }, [resultado]);

    // La sesión vive en una cookie HttpOnly: solo el backend puede confirmarla.
    useEffect(() => {
        let activo = true;

        fetch(`${API_URL}/auth/me`, { credentials: "include" })
            .then(async (respuesta) => {
                if (!activo) return;

                if (respuesta.ok) {
                    setUsuario(await respuesta.json());
                    setEstado("autenticado");
                } else if (respuesta.status === 401) {
                    setEstado("invitado");
                } else {
                    setEstado("error");
                }
            })
            .catch(() => {
                if (activo) setEstado("error");
            });

        return () => {
            activo = false;
        };
    }, []);

    const mensajeError =
        resultado?.auth === "error"
            ? (MENSAJES_ERROR[resultado.motivo] ?? MENSAJE_GENERICO)
            : null;

    return (
        <section className="acceso-social" aria-label="Acceso con red social">
            {estado === "cargando" && (
                <p className="acceso-social__texto">Comprobando sesión…</p>
            )}

            {estado === "autenticado" && (
                <div className="acceso-social__sesion" role="status">
                    {resultado?.auth === "ok" && (
                        <p className="acceso-social__texto">
                            ¡Registro completado!
                        </p>
                    )}
                    <p className="acceso-social__texto">
                        Sesión iniciada como{" "}
                        <strong>
                            {[usuario.nombre, usuario.apellido]
                                .filter(Boolean)
                                .join(" ")}
                        </strong>{" "}
                        ({usuario.correo_electronico}) · Rol: {usuario.rol}
                    </p>
                </div>
            )}

            {(estado === "invitado" || estado === "error") && (
                <>
                    {mensajeError && (
                        <p className="acceso-social__mensaje" role="alert">
                            {mensajeError} Continuás como invitado.
                        </p>
                    )}

                    {resultado?.auth === "ok" && estado === "invitado" && (
                        <p className="acceso-social__mensaje" role="alert">
                            No se pudo confirmar la sesión. Revisá que tu
                            navegador permita cookies e intentá nuevamente.
                        </p>
                    )}

                    {estado === "error" && (
                        <p className="acceso-social__mensaje" role="alert">
                            No se pudo comprobar la sesión con el servidor.
                        </p>
                    )}

                    <p className="acceso-social__texto">
                        Registrate o ingresá con tu red social:
                    </p>

                    <div className="acceso-social__botones">
                        <a
                            className="acceso-social__boton acceso-social__boton--google"
                            href={`${API_URL}/auth/google`}
                        >
                            Continuar con Google
                        </a>
                        <a
                            className="acceso-social__boton acceso-social__boton--facebook"
                            href={`${API_URL}/auth/facebook`}
                        >
                            Continuar con Facebook
                        </a>
                    </div>
                </>
            )}
        </section>
    );
}
