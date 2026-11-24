CREATE TABLE IF NOT EXISTS proveedores (
    id_proveedor SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    cuit VARCHAR(20) UNIQUE,
    telefono VARCHAR(30),
    email VARCHAR(120),
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS compras_proveedores (
    id_compra_proveedor SERIAL PRIMARY KEY,
    id_proveedor INTEGER NOT NULL,
    numero_comprobante VARCHAR(50) NOT NULL,
    fecha_compra DATE NOT NULL DEFAULT CURRENT_DATE,
    monto_total NUMERIC(12, 2) NOT NULL CHECK (monto_total >= 0),
    observaciones TEXT,
    estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_DETALLE',
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_compra_proveedor
        FOREIGN KEY (id_proveedor)
        REFERENCES proveedores(id_proveedor)
);

INSERT INTO proveedores (nombre, cuit, telefono, email)
VALUES
    (
        'Distribuidora Andina Outdoor S.A.',
        '30-71234567-9',
        '3442-451122',
        'ventas@andinaoutdoor.com.ar'
    ),
    (
        'Importadora Patagonia Camping SRL',
        '30-70987654-3',
        '11-5234-9988',
        'contacto@patagoniacamping.com'
    ),
    (
        'Textil Montaña Argentina',
        '30-68451230-1',
        '351-4892211',
        'pedidos@textilmontana.com.ar'
    )
ON CONFLICT (cuit) DO NOTHING;
