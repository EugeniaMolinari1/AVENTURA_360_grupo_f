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

## Registro con una red social: HU-06

El invitado se registra (o vuelve a ingresar) con **Google** o **Facebook**. No hay
registro con contraseña. El backend controla todo el flujo OAuth 2.0 de código de
autorización: el navegador solo es redirigido, y los secretos de las aplicaciones
nunca salen del servidor.

1. El frontend navega a `GET /api/auth/google` o `GET /api/auth/facebook`.
2. El backend genera `state` (y `nonce` y PKCE en Google), los guarda en una cookie
   firmada de 10 minutos y redirige al proveedor.
3. El proveedor vuelve a `GET /api/auth/<proveedor>/callback`. El backend valida
   `state`, intercambia el código con su secreto y **verifica la identidad**:
   - Google: firma del ID token con las claves públicas de Google, emisor, audiencia,
     vencimiento, `nonce` y `email_verified = true`.
   - Facebook: consulta de Graph API (`/me`) con el token obtenido directamente de
     Facebook y `appsecret_proof`.
4. Si la identidad ya existe, se autentica a su usuario; si no, se crea el usuario con
   rol `cliente` y su cuenta social, en una transacción. Nunca se vincula una
   identidad nueva a un usuario existente por coincidir el correo: se rechaza con
   `email_en_uso`.
5. Se emite la sesión (JWT firmado, 7 días) en la cookie `a360_sesion`
   (`HttpOnly`, `SameSite=Lax` y `Secure` cuando `NODE_ENV=production`) y se redirige
   a `FRONTEND_URL/?auth=ok`.

Ante cualquier fallo o cancelación se redirige a `FRONTEND_URL/?auth=error&motivo=...`
sin crear sesión: el usuario continúa como invitado. Motivos: `cancelado`,
`estado_invalido`, `sin_email`, `email_no_verificado`, `email_en_uso`,
`datos_incompletos`, `proveedor_error`, `no_disponible` y `ya_autenticado`.
Los datos de identidad salen solo de lo verificado con el proveedor, nunca de
parámetros enviados por el cliente. Facebook sin correo no completa el registro.

### Endpoints

| Método y ruta | Descripción |
| --- | --- |
| `GET /api/auth/google`, `GET /api/auth/facebook` | Inicia la autenticación (redirige al proveedor). |
| `GET /api/auth/google/callback`, `GET /api/auth/facebook/callback` | Los usa el proveedor; no se llaman a mano. |
| `GET /api/auth/me` | Con sesión: `200` y `{ id_usuario, nombre, apellido, correo_electronico, rol }`. Sin sesión o inválida: `401` y `{ "errores": ["No autenticado."] }`. |

No hay cierre de sesión en esta historia: para volver a ser invitado, borrar la
cookie `a360_sesion` desde las herramientas del navegador.

### Base de datos

Ejecutar **una sola vez** `backend/src/db/sql/004_hu06_usuarios.sql` (no depende de
los demás scripts). Desde la raíz del repositorio, en PowerShell:

```powershell
Get-Content -Raw backend/src/db/sql/004_hu06_usuarios.sql | docker compose exec -T postgres psql -U postgres -d aventura360 -v ON_ERROR_STOP=1
```

Crea `usuario` (`id_usuario`, `nombre`, `apellido`, `correo_electronico`, `dni`,
`telefono`, `rol` con valores `cliente` o `administrador`) y `cuenta_social`
(`id_cuenta_social`, `id_usuario`, `proveedor`, `id_proveedor`). El correo es único sin
distinguir mayúsculas. Cada identidad `(proveedor, id_proveedor)` pertenece a un solo
usuario, y un usuario tiene como máximo una cuenta por proveedor. La estructura
admite vincular Google y Facebook a un mismo usuario, pero esa vinculación no está
implementada. En `cuenta_social`, `id_proveedor` es el identificador del usuario en la
red social, no el de los proveedores comerciales de la HU-28.

### Variables de entorno (`backend/.env`)

El archivo `.env` está ignorado por git. Nunca subir valores reales.

| Variable | Descripción |
| --- | --- |
| `SESSION_SECRET` | Cadena aleatoria de al menos 32 caracteres. Generar con `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. |
| `BACKEND_URL` | URL pública del backend (por defecto `http://localhost:3001`). |
| `FRONTEND_URL` | URL del frontend (por defecto `http://localhost:5173`). Es el único destino de las redirecciones y el único origen CORS con credenciales de `/api/auth`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Credenciales de Google. |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | Credenciales de Meta. |
| `FACEBOOK_GRAPH_VERSION` | Versión de Graph API (por defecto `v23.0`). Verificar que siga vigente. |

Lo que no esté configurado se deshabilita sin afectar al resto de la API (el botón
correspondiente redirige con `motivo=no_disponible`). El frontend usa
`VITE_API_URL` (por defecto `http://localhost:3001/api`).

### Configurar Google

1. En [Google Cloud Console](https://console.cloud.google.com/), crear un proyecto.
2. En **APIs y servicios → Pantalla de consentimiento de OAuth**: tipo de usuario
   *Externo*, estado *En pruebas*, y agregar como *usuarios de prueba* los correos
   de quienes van a probar. Alcances: `openid`, `email` y `profile`.
3. En **Credenciales → Crear credenciales → ID de cliente de OAuth**: tipo
   *Aplicación web*.
4. En *URI de redirección autorizados* agregar exactamente
   `http://localhost:3001/api/auth/google/callback`.
5. Copiar el ID y el secreto del cliente a `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.

### Configurar Facebook

1. En [Meta for Developers](https://developers.facebook.com/), crear una app y
   agregar el producto **Facebook Login**.
2. En *Facebook Login → Configuración* agregar como *URI de redireccionamiento de OAuth
   válidos* exactamente `http://localhost:3001/api/auth/facebook/callback`.
3. Permisos usados: `public_profile` y `email`.
4. La app queda en modo *Desarrollo*: solo pueden ingresar quienes tengan un rol en
   la app (administradores, desarrolladores o testers). Agregar a quienes prueben en
   **Roles de la app**. Pasar a modo público exige requisitos de Meta y no es necesario.
5. Copiar el ID y el secreto de la app (*Configuración → Básica*) a `FACEBOOK_APP_ID` y
   `FACEBOOK_APP_SECRET`.

### Pruebas automáticas

`npm test` desde `backend` ejecuta también:

- `test/auth.proveedores.test.js` y `test/auth.sesion.test.js`: no necesitan base de
  datos. Verifican la validación de ID tokens de Google con claves generadas en la
  prueba (firma, emisor, audiencia, vencimiento, `nonce`, correo), el adaptador de
  Facebook, la sesión, la configuración y los validadores.
- `test/auth.test.js`: crea un esquema aislado, carga solo `004` y recorre el flujo
  completo por HTTP con proveedores simulados: registro con Google y Facebook, rol
  `cliente`, identidades repetidas y simultáneas, correo en uso, `state` inválido,
  cancelaciones, errores, `/api/auth/me`, cookies, CORS y restricciones de la base.

**Estas pruebas no equivalen a verificar la autenticación real**: los proveedores están
simulados. Falta la prueba manual con cuentas reales de Google y Facebook.

### Prueba manual con los proveedores reales

1. Aplicar `004` (arriba) y completar `backend/.env` con las credenciales.
2. Iniciar el backend (`npm run dev` en `backend`) y el frontend (`npm run dev` en
   `frontend`, que usa el puerto 5173).
3. Abrir `http://localhost:5173` en una ventana sin sesión. Debe verse "Registrate o
   ingresá con tu red social" con los dos botones.
4. **Google, registro**: pulsar *Continuar con Google* y elegir una cuenta de prueba.
   Debe volver a la aplicación con "¡Registro completado!" y la sesión iniciada con
   rol `cliente`. Verificar en la base: `SELECT * FROM usuario;` y
   `SELECT * FROM cuenta_social;` (una fila en cada tabla).
5. Recargar: la sesión se mantiene. `http://localhost:3001/api/auth/me` en el
   navegador devuelve los datos del usuario.
6. Borrar la cookie `a360_sesion` (herramientas del navegador → Aplicación →
   Cookies) y repetir con la misma cuenta: no debe crear usuarios nuevos.
7. **Cancelación**: pulsar el botón y cancelar en la pantalla del proveedor. Debe
   mostrar "Cancelaste el proceso…" y seguir como invitado, sin filas nuevas.
8. **Facebook, registro**: repetir con *Continuar con Facebook* usando una cuenta con
   rol en la app y con correo. Debe crear otro usuario independiente.
9. **Correo ya usado**: con Facebook, ingresar con una cuenta cuyo correo coincida con
   el de la cuenta de Google ya registrada. Debe rechazar con "ya está asociado a otra
   cuenta" y no crear ni vincular nada.
10. **Facebook sin correo**: si se dispone de una cuenta sin correo (o negando el
    permiso de correo), debe mostrar el mensaje de correo obligatorio y no crear nada.
11. Comprobar en las herramientas del navegador que la cookie `a360_sesion` es
    `HttpOnly` y `SameSite=Lax`, y que no hay tokens en la URL final.
