-- Requiere haber aplicado antes 001_hu19_productos.sql.
-- Ejecutar una sola vez con psql y ON_ERROR_STOP=1.
BEGIN;

CREATE TABLE variedad (
    id_variedad INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_producto INTEGER NOT NULL REFERENCES producto (id_producto),
    color TEXT,
    medida TEXT,
    tamano_capacidad TEXT,
    -- El stock pertenece a la variedad, no al producto.
    stock INTEGER NOT NULL CHECK (stock >= 0),
    stock_minimo INTEGER NOT NULL CHECK (stock_minimo >= 0),
    -- Cada caracteristica es opcional, pero debe existir al menos una.
    CHECK (color IS NOT NULL OR medida IS NOT NULL OR tamano_capacidad IS NOT NULL),
    -- Un texto presente no puede estar vacio ni ser solo espacios.
    CHECK (color IS NULL OR btrim(color) <> ''),
    CHECK (medida IS NULL OR btrim(medida) <> ''),
    CHECK (tamano_capacidad IS NULL OR btrim(tamano_capacidad) <> '')
);

-- Evita variedades duplicadas del mismo producto sin distinguir mayusculas ni
-- espacios en los extremos. COALESCE hace que dos NULL cuenten como iguales;
-- no hay ambiguedad con '' porque los CHECK impiden textos vacios.
CREATE UNIQUE INDEX variedad_producto_caracteristicas_uq
    ON variedad (
        id_producto,
        COALESCE(lower(btrim(color)), ''),
        COALESCE(lower(btrim(medida)), ''),
        COALESCE(lower(btrim(tamano_capacidad)), '')
    );

COMMIT;
