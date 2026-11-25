const { ErrorAutenticacion } = require("./auth/errores");

const CODIGO_VIOLACION_UNICA = "23505";
const INDICE_CORREO = "usuario_correo_uq";

const COLUMNAS_USUARIO =
    "u.id_usuario, u.nombre, u.apellido, u.correo_electronico, u.rol";

async function buscarPorIdentidad(ejecutor, proveedor, idProveedor) {
    const {
        rows: [usuario],
    } = await ejecutor.query(
        `SELECT ${COLUMNAS_USUARIO}
         FROM cuenta_social c
         JOIN usuario u ON u.id_usuario = c.id_usuario
         WHERE c.proveedor = $1 AND c.id_proveedor = $2`,
        [proveedor, idProveedor]
    );

    return usuario;
}

async function crearUsuarioConCuenta(pool, perfil) {
    const cliente = await pool.connect();

    try {
        await cliente.query("BEGIN");

        // El rol lo fija el servidor: todo registro social es cliente.
        const {
            rows: [usuario],
        } = await cliente.query(
            `INSERT INTO usuario (nombre, apellido, correo_electronico, rol)
             VALUES ($1, $2, $3, 'cliente')
             RETURNING id_usuario, nombre, apellido, correo_electronico, rol`,
            [perfil.nombre, perfil.apellido, perfil.correo_electronico]
        );

        await cliente.query(
            `INSERT INTO cuenta_social (id_usuario, proveedor, id_proveedor)
             VALUES ($1, $2, $3)`,
            [usuario.id_usuario, perfil.proveedor, perfil.id_proveedor]
        );

        await cliente.query("COMMIT");

        return usuario;
    } catch (error) {
        await cliente.query("ROLLBACK");
        throw error;
    } finally {
        cliente.release();
    }
}

// Registra o autentica segun la identidad social verificada: si la identidad
// ya existe devuelve su usuario; si no, crea usuario y cuenta social. Nunca
// vincula una identidad nueva a un usuario existente por coincidencia de correo.
async function autenticarConIdentidad(pool, perfil) {
    const existente = await buscarPorIdentidad(
        pool,
        perfil.proveedor,
        perfil.id_proveedor
    );

    if (existente) return existente;

    try {
        return await crearUsuarioConCuenta(pool, perfil);
    } catch (error) {
        if (error.code !== CODIGO_VIOLACION_UNICA) throw error;

        // Otra peticion pudo registrar esta misma identidad en simultaneo.
        const registrado = await buscarPorIdentidad(
            pool,
            perfil.proveedor,
            perfil.id_proveedor
        );

        if (registrado) return registrado;

        if (error.constraint === INDICE_CORREO) {
            throw new ErrorAutenticacion("email_en_uso");
        }

        throw error;
    }
}

async function buscarUsuarioPorId(pool, idUsuario) {
    const {
        rows: [usuario],
    } = await pool.query(
        `SELECT ${COLUMNAS_USUARIO} FROM usuario u WHERE u.id_usuario = $1`,
        [idUsuario]
    );

    return usuario ?? null;
}

module.exports = { autenticarConIdentidad, buscarUsuarioPorId };
