# Aventura 360

Sistema e-commerce desarrollado como Trabajo Integrador Final.

## Tecnologías

### Frontend
- React
- Vite
- JavaScript
- CSS
- Oxlint

### Backend
- Node.js
- Express
- API REST

### Base de datos
- PostgreSQL 18

### Herramientas
- Docker
- Docker Compose
- Git
- GitHub
- Postman

## Requisitos

Para ejecutar el proyecto es necesario tener instalado:

- Git
- Node.js
- npm
- Docker Desktop

## Instalación

### 1. Clonar el repositorio

```bash
git clone URL-DEL-REPOSITORIO
```

## Base de datos: HU-19

Desde la raíz del repositorio, iniciar PostgreSQL 18 con `docker compose up -d postgres`.
Para aplicar la estructura de productos una sola vez, ejecutar en PowerShell:

```powershell
Get-Content -Raw backend/src/db/sql/001_hu19_productos.sql | docker compose exec -T postgres psql -U postgres -d aventura360 -v ON_ERROR_STOP=1
```

El script crea las tablas dentro de una transacción y carga las cuatro ocasiones
permitidas. Si ocurre un error, no se aplica parcialmente. No es un script para
ejecutar repetidamente sobre tablas ya creadas.

La ejecución es explícita porque los scripts de inicialización de Docker solo se
ejecutan cuando el directorio de datos está vacío. No es necesario borrar el
volumen persistente existente.

Los subtipos comparten `id_producto` como clave primaria y foránea. Las ocasiones
tienen `id_ocasion` autogenerado y nombre único; `producto_ocasion` relaciona ambos
identificadores. Las imágenes guardan únicamente referencias, sin configurar
Cloudinary.

Las claves foráneas y restricciones básicas se validan en PostgreSQL. La regla de
exactamente un subtipo y el mínimo de una ocasión se validan en el backend de
registro. La selección de la primera imagen como principal se implementará
posteriormente en el backend. No hay
triggers ni stock en estas tablas. El precio se almacena como `NUMERIC` sin escala
declarada y se rechazan valores no positivos o con más de dos decimales sin
redondearlos silenciosamente.

## Registro de productos: HU-19

Con la base inicializada, ejecutar `npm install` y `npm run dev` desde `backend`.
La conexion usa las variables `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y
`DB_PASSWORD` de `backend/.env`. El puerto HTTP usa `PORT` o `3001`.

### POST /api/productos

Enviar `Content-Type: application/json`. Ejemplo de carpa:

```json
{
  "nombre": "Carpa para dos personas",
  "descripcion": "Carpa de camping",
  "marca": "Aventura",
  "precio": "123.45",
  "dimensiones": "200 x 150 x 120 cm",
  "tipo": "carpa",
  "detalle": { "capacidad_personas": 2, "peso_kg": 2.5 },
  "ocasiones": [1, 2]
}
```

`ocasiones` contiene identificadores existentes de `ocasion`, sin repetir y con
al menos un elemento. Los numeros del ejemplo deben coincidir con el catalogo
de la base utilizada. Los textos son obligatorios y no pueden estar vacios.
El endpoint rechaza campos adicionales, incluidos `activo` e `id_producto`.

`precio` acepta un numero JSON o texto decimal positivo, con hasta dos decimales
y sin notacion exponencial. Se recomienda enviarlo como texto para conservar
exactamente su precision desde el cliente; no se redondea ni convierte a float
antes de enviarlo a PostgreSQL. PostgreSQL devuelve `precio` y `peso_kg` como
texto decimal en la respuesta.

| tipo | Campos obligatorios de detalle |
| --- | --- |
| `carpa` | `capacidad_personas`: entero positivo; `peso_kg`: numero positivo finito |
| `mochila` | `capacidad_litros`: entero positivo |
| `termo` | `capacidad_ml`: entero positivo; `termico`: booleano (`false` es valido) |
| `accesorio` | `tipo_accesorio`: texto no vacio |

Las capacidades y los identificadores deben estar dentro del rango de `INTEGER`
de PostgreSQL. Solo se admiten los campos del subtipo seleccionado.

La respuesta `201` contiene los campos persistidos del producto, `tipo`, `detalle`
y los identificadores de `ocasiones`. `activo` comienza en `true`. Los datos
invalidos reciben `400` con `{ "errores": ["mensaje"] }`; los errores internos
reciben `500` con `{ "error": "No se pudo registrar el producto." }`.

La comprobacion de ocasiones y las inserciones de producto, subtipo y asociaciones
usan una unica transaccion y un mismo cliente. Cualquier fallo provoca `ROLLBACK`;
el cliente siempre se libera. No se registran imagenes en esta etapa.

### Pruebas del backend

Desde `backend`, ejecutar `npm test` (en PowerShell, `npm.cmd test` si la politica
local bloquea `npm.ps1`). Requiere PostgreSQL disponible y las variables de
conexion configuradas. El usuario de pruebas debe poder crear esquemas.

Las pruebas crean un esquema aislado con nombre aleatorio, cargan el SQL de HU-19,
ejercitan el endpoint por HTTP y eliminan ese esquema al finalizar. No escriben
en las tablas de `public`. Cubren los cuatro subtipos, datos invalidos, ocasiones
inexistentes, nombres repetidos y rollback ante fallos reales de restricciones
del subtipo y de las asociaciones, incluyendo la reutilizacion del cliente.

## Registro de variedades: HU-26

### Base de datos

Requiere haber aplicado antes `001_hu19_productos.sql`. Con PostgreSQL iniciado
(`docker compose up -d postgres`), ejecutar **una sola vez** desde la raíz del repositorio:

```powershell
Get-Content -Raw backend/src/db/sql/002_hu26_variedades.sql | docker compose exec -T postgres psql -U postgres -d aventura360 -v ON_ERROR_STOP=1
```

El script es transaccional: si falla, no se aplica nada.

La tabla `variedad` tiene `id_variedad`, `id_producto` (clave foránea a `producto`),
`color`, `medida`, `tamano_capacidad`, `stock` y `stock_minimo`. El stock pertenece a la
variedad, no al producto. No hay SKU, precio, imágenes ni estado activo.

PostgreSQL garantiza que `stock` y `stock_minimo` sean enteros mayores o iguales a 0,
que al menos una característica esté informada, que ningún texto sea vacío y que no se
repita una variedad del mismo producto. El índice único `variedad_producto_caracteristicas_uq`
compara las características sin distinguir mayúsculas y sin espacios en los extremos, y
trata `NULL` como un valor más (por ejemplo, dos variedades solo con `color = "Rojo"`
son duplicadas).

### POST /api/variedades

Enviar `Content-Type: application/json`:

```json
{
  "id_producto": 1,
  "color": "Rojo",
  "medida": "M",
  "tamano_capacidad": "30 L",
  "stock": 10,
  "stock_minimo": 2
}
```

- `id_producto`, `stock` y `stock_minimo` son obligatorios y deben ser enteros JSON
  (no texto). `id_producto` positivo; `stock` y `stock_minimo` mayores o iguales a 0.
- `color`, `medida` y `tamano_capacidad` son opcionales individualmente y se pueden
  combinar, pero debe informarse al menos uno. Se pueden omitir o enviar como `null`;
  un texto vacío o solo con espacios es inválido.
- Los textos se guardan sin espacios en los extremos y con los espacios internos
  repetidos reducidos a uno. Se conservan las mayúsculas originales.
- Se rechazan los campos adicionales (por ejemplo `precio`, `activo`, `sku` o `id_variedad`).
- El producto debe existir y estar activo.

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `201` | Variedad registrada | La fila creada, con todos sus campos |
| `400` | Datos inválidos, JSON mal formado, producto inactivo o variedad duplicada | `{ "errores": ["mensaje"] }` |
| `404` | El producto no existe | `{ "errores": ["El producto indicado no existe."] }` |
| `500` | Error interno | `{ "error": "No se pudo registrar la variedad." }` |

La verificación del producto y la inserción usan una única transacción y un mismo
cliente; ante cualquier fallo se hace `ROLLBACK` y el cliente se libera. El producto
se bloquea con `FOR SHARE` mientras se registra la variedad.

### Probar con Postman

1. Tener `001` y `002` aplicados y el backend en marcha (`npm run dev` en `backend`).
2. Registrar antes un producto con HU-19 (`POST /api/productos`) y anotar su
   `id_producto`, o consultar `SELECT id_producto, nombre, activo FROM producto;`.
3. Enviar `POST http://localhost:3001/api/variedades` con el cuerpo de ejemplo
   (Body → raw → JSON) usando ese `id_producto`.
4. Comprobar `201`. Repetir el mismo envío (también cambiando mayúsculas o espacios):
   debe responder `400` por duplicada. Con otro `id_producto` inexistente: `404`.

### Pruebas automáticas

`npm test` desde `backend` ejecuta también `test/variedades.test.js`, que crea un
esquema aislado con nombre aleatorio, carga `001` y `002`, ejercita el endpoint por
HTTP y elimina el esquema. No necesita Cloudinary. Cubren el validador, el alta
correcta, las combinaciones de características, el stock por variedad, producto
inexistente e inactivo, duplicados (mayúsculas, espacios y `NULL`), las restricciones
propias de la base de datos y el rollback con reutilización del cliente.
