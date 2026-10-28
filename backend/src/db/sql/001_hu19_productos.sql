-- Ejecutar una sola vez con psql y ON_ERROR_STOP=1.
BEGIN;

CREATE TABLE producto (
    id_producto INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    marca TEXT NOT NULL,
    -- Sin escala declarada: el CHECK rechaza decimales extra sin redondearlos.
    precio NUMERIC NOT NULL
        CHECK (precio > 0 AND precio < 'Infinity'::NUMERIC
               AND precio = trunc(precio, 2)),
    dimensiones TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT true
);

-- Cada subtipo comparte el identificador del producto mediante PK/FK.
-- El backend verificara exactamente un subtipo dentro de la transaccion.
CREATE TABLE carpa (
    id_producto INTEGER PRIMARY KEY REFERENCES producto (id_producto),
    capacidad_personas INTEGER NOT NULL CHECK (capacidad_personas > 0),
    peso_kg NUMERIC NOT NULL
        CHECK (peso_kg > 0 AND peso_kg < 'Infinity'::NUMERIC)
);

CREATE TABLE mochila (
    id_producto INTEGER PRIMARY KEY REFERENCES producto (id_producto),
    capacidad_litros INTEGER NOT NULL CHECK (capacidad_litros > 0)
);

CREATE TABLE termo (
    id_producto INTEGER PRIMARY KEY REFERENCES producto (id_producto),
    capacidad_ml INTEGER NOT NULL CHECK (capacidad_ml > 0),
    termico BOOLEAN NOT NULL
);

CREATE TABLE accesorio (
    id_producto INTEGER PRIMARY KEY REFERENCES producto (id_producto),
    tipo_accesorio TEXT NOT NULL
);

CREATE TABLE ocasion (
    id_ocasion INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE
        CHECK (nombre IN ('camping', 'trekking', 'kayac', 'senderismo'))
);

INSERT INTO ocasion (nombre)
VALUES ('camping'), ('trekking'), ('kayac'), ('senderismo');

-- El backend verificara al menos una ocasion dentro de la transaccion.
CREATE TABLE producto_ocasion (
    id_producto INTEGER NOT NULL REFERENCES producto (id_producto),
    id_ocasion INTEGER NOT NULL REFERENCES ocasion (id_ocasion),
    PRIMARY KEY (id_producto, id_ocasion)
);

CREATE TABLE imagen (
    id_imagen INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_producto INTEGER NOT NULL REFERENCES producto (id_producto),
    url TEXT NOT NULL,
    public_id TEXT NOT NULL,
    principal BOOLEAN NOT NULL DEFAULT false
);

COMMIT;
