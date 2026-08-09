# Cotizaciones y encargos

Proyecto React (Vite) que gestiona cotizaciones, proveedores y el avance de
cada encargo (en cotización → pedido → en camino → en tienda → entregado).
No necesita backend propio: habla directo con Supabase (base de datos +
login) desde el navegador vía su REST/Auth API.

## Cómo está pensado el acceso

Hay **2 logins compartidos**, uno por área:

- **Cyber** (rol `cotizador`): agrega el proveedor, el precio final, notas
  de proceso y mueve el estado del encargo. No puede editar cantidades.
  Es el único que ve Proveedores y "Faltantes en tienda".
- **Ocampo** (rol `solicitante`): crea cotizaciones a nombre de una
  escuela/cliente, agrega los productos a cotizar y controla las
  cantidades. No ve la lista de proveedores ni los precios que aún no
  se han definido.

Como varias personas usan el mismo login por área, cada área tiene su
propia lista de "Equipo" (una tabla simple, no son cuentas de acceso):

- **Trabajadores de Cyber**: se elige quién cotizó cada producto.
- **Trabajadores de Ocampo**: se elige quién solicita cada cotización.

Esto es solo para llevar control interno de quién hizo qué — el login
sigue siendo uno solo por área.

## Estructura
```
index.html
vite.config.js
package.json
schema.sql                 -> correr una vez (o de nuevo) en el SQL Editor de Supabase
src/
  main.jsx, App.jsx
  supabaseClient.js          -> auth + llamadas REST a Supabase
  utils.js                   -> estados, formatos de fecha/dinero
  styles.css
  components/
    SetupScreen.jsx           (solo si no hay variables de entorno)
    LoginScreen.jsx
    StatusStepper.jsx          (barra de progreso + badge de estado)
    Board.jsx                  (tablero kanban)
    CotizacionDetail.jsx       (detalle: productos, edición por rol)
    NuevaCotizacionModal.jsx   (escuela + quién de Ocampo solicita)
    ProveedoresScreen.jsx      (solo Cyber)
    TrabajadoresScreen.jsx     (roster de Cyber u Ocampo según el rol)
    FaltantesScreen.jsx        (solo Cyber: productos faltantes en tienda)
    AppShell.jsx                (layout con sidebar y tabs por rol)
```

## 1. Prepara Supabase (una sola vez)
1. Crea un proyecto en supabase.com.
2. Ve a **SQL Editor → New query**, pega todo `schema.sql` y dale **Run**
   (es seguro volver a correrlo aunque ya tengas la base creada — incluye
   la tabla de bitácora y el bloqueo de cambio de rol).
3. Ve a **Authentication → Users → Add user** y crea dos cuentas. La app
   pide solo "usuario" (no un correo real), pero Supabase Auth siempre
   necesita un email por dentro, así que se usa un dominio falso interno:
   - `cyber@internal.local` → en la app se inicia sesión como usuario `cyber`
   - `ocampo@internal.local` → en la app se inicia sesión como usuario `ocampo`
   Marca **Auto Confirm User** al crearlas (nadie va a confirmar un correo
   que no existe). Copia el UUID de cada una (aparece en la lista de usuarios).
4. En **SQL Editor** ejecuta, reemplazando los UUID:
   ```sql
   insert into public.profiles (id, nombre, role) values
   ('UUID-DE-CYBER', 'Cyber', 'cotizador');

   insert into public.profiles (id, nombre, role) values
   ('UUID-DE-OCAMPO', 'Ocampo', 'solicitante');
   ```
5. Copia el **Project URL** y la **anon public key** desde **Settings → API**.
6. (Opcional) Agrega personas a cada equipo desde la pestaña "Equipo" de
   la app una vez que esté corriendo, o por SQL:
   ```sql
   insert into public.trabajadores_cyber (nombre) values ('Juan Pérez');
   insert into public.trabajadores_ocampo (nombre) values ('María Ocampo');
   ```

## 2. Corre el proyecto en tu máquina (opcional, para probar)
```bash
npm install
cp .env.example .env.local
# edita .env.local con tu URL y anon key
npm run dev
```
Inicia sesión con el **usuario** (`cyber` u `ocampo`), no con un correo.

## 3. Despliega en Vercel

### Con GitHub (recomendado)
1. Sube esta carpeta a un repositorio de GitHub.
2. En vercel.com → **Add New → Project** → importa el repo.
3. Vercel detecta Vite automáticamente (build command `vite build`,
   output `dist`) — no hay que tocar nada ahí.
4. En **Environment Variables** agrega:
   - `VITE_SUPABASE_URL` = tu Project URL
   - `VITE_SUPABASE_ANON_KEY` = tu anon key
   - `VITE_AUTH_EMAIL_DOMAIN` = `internal.local` (opcional, es el default)
5. Deploy.

### Con la CLI de Vercel
```bash
npm install -g vercel
vercel                 # primer deploy, sigue las preguntas
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
vercel --prod
```

Si no configuras las variables de entorno, la app muestra una pantalla de
configuración manual la primera vez (útil para pruebas rápidas), pero para
producción lo correcto es usar las variables de entorno de Vercel.

## Cómo quedó el flujo de una cotización
1. **Ocampo** crea la cotización: título, escuela/cliente, y escribe la
   lista de productos que necesita cotizar directo en el cuadro de texto
   (uno por línea) — ya no hace falta agregarlos uno por uno. El
   "solicitante" se toma automáticamente de la persona seleccionada en
   "¿Quién eres?", sin tener que elegirla de nuevo.
2. **Cyber** abre esa cotización, lee la lista de productos pedidos, y
   por cada uno agrega un "producto cotizado" con: proveedor, precio
   final, cantidad disponible, una descripción breve opcional y, si
   quiere, una foto/captura (se comprime automáticamente en el
   navegador antes de guardarse).
3. **Ocampo** ve esos productos cotizados (con foto, precio, proveedor)
   dentro de la misma cotización, y puede seguir el avance por el
   tablero de estados.

Ocampo también puede, si prefiere, seguir agregando productos sueltos
uno por uno con cantidad (como antes) — es opcional, no obligatorio.

## Mejoras de seguridad y control incluidas
- **Nadie puede subirse el rol a sí mismo.** Antes, cualquiera con las
  credenciales podía, con una llamada directa a la API, cambiar su propio
  `role` de `solicitante` a `cotizador`. Ahora hay un trigger en la base
  de datos que bloquea cualquier cambio de rol desde la app — solo se
  puede cambiar corriendo SQL a mano (ver comentarios en `schema.sql`).
- **"¿Quién eres?"**: la primera vez que cada cuenta (Cyber u Ocampo) se
  usa en un navegador, pide elegir el nombre de la persona real detrás
  del login compartido (o agregarla si es nueva). Ese nombre queda
  guardado en ese navegador y se usa para rellenar automáticamente
  "cotizado por" / "quién solicita", y para la bitácora. Se puede
  cambiar en cualquier momento con el botón "Cambiar persona".
- **Bitácora de actividad** (pestaña "Actividad", solo Cyber): registra
  quién creó una cotización, agregó o editó un producto, lo eliminó, o
  cambió el estado — con nombre de la persona, no solo "Cyber"/"Ocampo".
- **Confirmación antes de borrar** productos y faltantes, para evitar
  eliminar algo por error con un solo clic.

## Reglas de permisos (aplicadas también en la base de datos, no solo en la UI)
- Solo Cyber puede ver y administrar Proveedores.
- Solo Cyber puede ver "Faltantes en tienda" y la bitácora de "Actividad".
- Ocampo puede editar `producto` y `cantidad` de un item que él mismo
  agregó; no puede tocar proveedor, precio, cantidad disponible,
  descripción, imagen, notas ni "cotizado por".
- Cyber puede crear y editar libremente los productos cotizados
  (proveedor, precio, cantidad, descripción, imagen, notas).
- Solo Cyber puede cambiar el estado del encargo (cotización → pedido → …).

Estas reglas están reforzadas con políticas RLS y triggers en
`schema.sql`, así que aunque alguien intente saltarse la interfaz (por
ejemplo llamando la API directamente), Supabase las sigue aplicando.

## Notas
- La *anon key* de Supabase está diseñada para exponerse en el navegador;
  la seguridad real la dan las políticas RLS y los triggers de `schema.sql`.
- Para un dominio propio: Vercel → Project → Settings → Domains.
