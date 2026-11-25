-- No depende de otros scripts. Ejecutar una sola vez con psql y ON_ERROR_STOP=1.
BEGIN;

CREATE TABLE usuario (
    id_usuario INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL CHECK (btrim(nombre) <> ''),
    -- Opcionales durante el registro con una red social.
    apellido TEXT CHECK (apellido IS NULL OR btrim(apellido) <> ''),
    correo_electronico TEXT NOT NULL CHECK (btrim(correo_electronico) <> ''),
    dni TEXT,
    telefono TEXT,
    rol TEXT NOT NULL DEFAULT 'cliente'
        CHECK (rol IN ('cliente', 'administrador'))
);

-- Un correo pertenece a un unico usuario, sin distinguir mayusculas. No se
-- vinculan cuentas automaticamente por coincidencia de correo.
CREATE UNIQUE INDEX usuario_correo_uq
    ON usuario (lower(btrim(correo_electronico)));

-- Identidades de redes sociales vinculadas a un usuario. La estructura admite
-- varias cuentas (Google y Facebook) para un mismo usuario.
CREATE TABLE cuenta_social (
    id_cuenta_social INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_usuario INTEGER NOT NULL REFERENCES usuario (id_usuario),
    proveedor TEXT NOT NULL CHECK (proveedor IN ('google', 'facebook')),
    -- Identificador del usuario en el proveedor (no es id_proveedor de la
    -- tabla de proveedores comerciales de la HU-28).
    id_proveedor TEXT NOT NULL CHECK (btrim(id_proveedor) <> ''),
    -- Cada identidad de un proveedor pertenece a un unico usuario.
    CONSTRAINT cuenta_social_identidad_uq UNIQUE (proveedor, id_proveedor),
    -- Un usuario tiene como maximo una cuenta de cada proveedor.
    CONSTRAINT cuenta_social_usuario_proveedor_uq UNIQUE (id_usuario, proveedor)
);

COMMIT;
