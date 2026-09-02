# Reducción de egreso en Supabase (plan gratuito)

Dos rondas de cambios. La primera atacó lo que estaba disparando el 205%; la
segunda apretó todo lo demás.

---

## El diagnóstico original

En los logs, en 2 h 13 min y con solo 2 usuarios conectados, hubo **831 llamadas
a `/rest/v1/cotizaciones`**, de las cuales **766 eran exactamente la misma**:

```
GET cotizaciones?select=*,cotizacion_items(*,proveedor:proveedores(nombre),cotizado:trabajadores_cyber(nombre))&order=created_at.desc
```

1. **`select=*` incluía las fotos.** Las imágenes se guardan como texto base64
   dentro de `cotizaciones.imagen_notas` y `cotizacion_items.imagen`. Cada
   recarga del tablero bajaba **todas las fotos de todas las cotizaciones**,
   aunque el tablero no muestre ni una imagen.
2. **Se recargaba cada 12 segundos, siempre**, aunque nada hubiera cambiado y
   aunque la pestaña estuviera en segundo plano.

---

## Ronda 1 — el sangrado principal

### El tablero pide solo lo que pinta

```js
const SELECT_TABLERO =
  'select=id,folio,escuela,titulo,solicitante_nombre,estado,created_at,updated_at,cotizacion_items(id,cantidad,precio_final)';
```

Sin `imagen`, sin `notas`, sin `descripcion`, sin los joins de proveedor y
cotizador. De varios MB a unos pocos KB por recarga.

### Consulta de "firma"

`api.firma(tabla)` pide una sola fila con una sola columna y lee el total desde
el header `Content-Range` (`Prefer: count=exact`). Devuelve algo como
`"47|2026-08-28T23:28:34.125+00:00"` en unos ~100 bytes: **total de filas +
fecha del último cambio**.

El temporizador pide esa firma y **solo descarga la lista si cambió**.

### El polling deja de gastar a ciegas

- Cada 20 s en vez de 12.
- **No hace nada si la pestaña está en segundo plano.**
- Comprueba de inmediato al volver al frente.

### La bitácora ya no pide eco

`logActividad` usaba `Prefer: return=representation` y Supabase devolvía la fila
insertada aunque el código la ignorara. Ahora usa `return=minimal`.

### Fotos más ligeras

De 900 px / calidad 0.72 a **720 px / calidad 0.55**. Solo afecta a las fotos
nuevas.

---

## Ronda 2 — apretar el resto

### Las fotos ya no se descargan al abrir una cotización

Este era el gasto principal que quedaba. Una cotización con cinco productos con
foto costaba ~400 KB **cada vez que alguien la abría**, y otra vez tras cada
edición, aunque nadie mirara ninguna imagen.

Ahora el detalle pide las columnas generadas `tiene_imagen` /
`tiene_imagen_notas` (un booleano) en lugar de la foto. Donde había una
miniatura hay un botón **📷 Ver foto**, y la imagen se descarga solo al pulsarlo.
Abrir una cotización pasa de cientos de KB a unos 2 KB.

Como efecto secundario, editar un producto ya no arrastra su foto de ida y de
vuelta: si no la tocas, ni se descarga ni se reenvía.

### Caché en el navegador, compartida entre pestañas

`src/cache.js`. Resuelve tres gastos que no se veían:

- **Recargar la página** (F5) volvía a bajar el tablero completo. Ahora se pinta
  al instante desde la caché y solo se comprueba la firma.
- **Varias pestañas abiertas** preguntaban cada una por su cuenta. Ahora, si una
  preguntó hace poco, las demás se saltan el ciclo.
- Cuando una pestaña sí baja datos nuevos, las otras los reciben **gratis** por
  el evento `storage` del navegador.

La caché lleva el id del perfil en la clave y se borra al cerrar sesión o al
caducar, porque Cyber y Ocampo no ven lo mismo.

### El chequeo se espacia solo

Si no hay cambios, la espera crece de 20 s hasta un tope de 2 minutos, y vuelve
a 20 s en cuanto aparece movimiento o la persona vuelve a la pestaña. Al volver
hay un mínimo de 5 s, para que alternar ventanas con alt+tab no dispare una
petición por cada cambio de foco.

### Red de seguridad

Pase lo que pase, cada 10 minutos se baja la lista completa. Si el trigger de la
base faltara o algo quedara desincronizado, el tablero se arregla solo en vez de
quedarse viejo indefinidamente.

### Catálogos cacheados

Proveedores y personal cambian cada varias semanas pero se descargaban en cada
carga de página. Ahora duran 30 minutos en el navegador, y se refrescan al
editarlos. Además, Ocampo ya no pide la tabla de proveedores, que las políticas
de Supabase no le dejan leer de todos modos.

---

## `optimizacion_egress.sql` — ejecutar una vez

**Correrlo en Supabase → SQL Editor ANTES de desplegar el código.** Hace tres
cosas:

1. Índices sobre `updated_at` / `created_at` para que la consulta de firma sea
   instantánea.
2. Un trigger para que al agregar, editar o borrar un **producto** se actualice
   el `updated_at` de su cotización. Sin esto la firma no cambiaría al tocar un
   producto y el tablero de la otra persona se quedaría con el total viejo.
3. Las columnas generadas `tiene_imagen` y `tiene_imagen_notas`.

**El punto 3 es obligatorio**: si se despliega el código sin correr el SQL, el
detalle de una cotización no abre (sale una pantalla de error explicándolo). El
tablero sí sigue funcionando.

Es seguro correrlo varias veces.

---

## Orden de instalación

1. Correr `optimizacion_egress.sql` en el SQL Editor de Supabase.
2. Descomprimir el zip encima de la raíz del proyecto, reemplazando.
3. `npm run dev` y probar (ver abajo qué mirar).
4. `git add -A && git commit && git push origin main`. Vercel despliega solo.
5. **Que todos recarguen con Ctrl+F5.** Las pestañas abiertas siguen corriendo
   el código viejo y su temporizador de 12 s.

### Qué mirar al probar

Con F12 → Network, filtrando por `cotizaciones`:

- En reposo, cada 20 s una petición de ~100 bytes
  (`select=updated_at&order=updated_at.desc&limit=1`). Debe ir espaciándose
  hasta 2 minutos si no tocas nada.
- Al cambiar de pestaña del navegador: las peticiones paran del todo. Al volver,
  una inmediata.
- Al recargar la página: el tablero aparece al instante y **no** se descarga la
  lista completa.
- Al abrir una cotización: una sola petición pequeña, sin imágenes. Solo al
  pulsar "Ver foto" aparece la petición de la imagen.
- Editar un producto sin tocar su foto: el proveedor y "quién cotizó" deben
  quedar como estaban, y la foto seguir ahí.

---

## Qué esperar en el consumo

El grueso del egreso pasa a depender de cuántas fotos se miren de verdad, que es
la única descarga pesada que queda y ya no ocurre sola. Un día normal de trabajo
con 2-3 personas debería moverse en unas pocas decenas de MB, contra los ~10 GB
del período que disparó la alerta.

Ojo: el 10.229 GB **no se borra**, es el acumulado del período de facturación
actual. Lo que se va a ver es que deja de subir. El contador se reinicia al
empezar el siguiente ciclo, y el tablero de Supabase tarda hasta 1 hora en
reflejar cambios.

---

## Si algún día se queda corto otra vez

Sacar las imágenes de la base y ponerlas en **Supabase Storage** (1 GB gratis),
guardando solo la URL. Ventajas: no inflan la base, se sirven con caché del
navegador (el egreso en caché tiene su propia cuota de 5 GB) y no viajan en
base64, que pesa un 33% más que el archivo. Con lo de arriba probablemente no
haga falta.

---

## Compromisos asumidos a propósito

- Si cierras el navegador y vuelves dentro de 10 minutos, la primera carga
  notifica todo lo que cambió en ese rato (1-3 avisos en el volumen de esta
  app). Pasados los 10 minutos se trata como primera carga y no notifica nada,
  para no soltar una ráfaga.
- Al arrancar con caché vieja, hay una ventana de ~20 s en la que un cambio del
  otro usuario se pinta sin notificar.
