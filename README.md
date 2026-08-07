# Cotizaciones y encargos

Proyecto React (Vite) que gestiona cotizaciones, proveedores y el avance de
cada encargo (en cotización → pedido → en camino → en tienda → entregado).
No necesita backend propio ni Python: habla directo con Supabase (base de
datos + login) desde el navegador vía su REST/Auth API.

## Estructura
```
index.html
vite.config.js
package.json
schema.sql                 -> correr una vez en el SQL Editor de Supabase
src/
  main.jsx                 -> entry point
  App.jsx                  -> maneja setup / login / app
  supabaseClient.js         -> auth + llamadas REST a Supabase
  utils.js                  -> estados, formatos de fecha/dinero
  styles.css
  components/
    SetupScreen.jsx          (solo si no hay variables de entorno)
    LoginScreen.jsx
    StatusStepper.jsx         (barra de progreso + badge de estado)
    Board.jsx                 (tablero kanban)
    CotizacionDetail.jsx      (detalle: productos, proveedores, notas)
    NuevaCotizacionModal.jsx
    ProveedoresScreen.jsx
    AppShell.jsx               (layout con sidebar y tabs)
```

## 1. Prepara Supabase (una sola vez)
1. Crea un proyecto en supabase.com.
2. Ve a **SQL Editor → New query**, pega todo `schema.sql` y dale **Run**.
3. Ve a **Authentication → Users → Add user** y crea dos cuentas (una para
   quien solicita cotizaciones, otra para quien las cotiza/jefe). Copia el
   UUID de cada una.
4. En **SQL Editor** ejecuta un `insert` por usuario (el patrón está al
   final de `schema.sql`), con `role = 'solicitante'` o `role = 'cotizador'`.
5. Copia el **Project URL** y la **anon public key** desde **Settings → API**.

## 2. Corre el proyecto en tu máquina (opcional, para probar)
```bash
npm install
cp .env.example .env.local
# edita .env.local con tu URL y anon key
npm run dev
```

## 3. Despliega en Vercel

### Con GitHub (recomendado)
1. Sube esta carpeta a un repositorio de GitHub.
2. En vercel.com → **Add New → Project** → importa el repo.
3. Vercel detecta Vite automáticamente (build command `vite build`,
   output `dist`) — no hay que tocar nada ahí.
4. En **Environment Variables** agrega:
   - `VITE_SUPABASE_URL` = tu Project URL
   - `VITE_SUPABASE_ANON_KEY` = tu anon key
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

## Notas
- La *anon key* de Supabase está diseñada para exponerse en el navegador;
  la seguridad real la dan las políticas RLS que crea `schema.sql`.
- El rol `cotizador` puede cambiar el estado del encargo y borrar
  productos; `solicitante` puede crear cotizaciones, agregar productos y
  ver el avance de todas.
- Para un dominio propio: Vercel → Project → Settings → Domains.
