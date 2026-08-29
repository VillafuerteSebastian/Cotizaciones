# Reducción de egreso en Supabase (plan gratuito)

## El diagnóstico

En los logs, en 2 h 13 min y con solo 2 usuarios conectados, hubo **831 llamadas
a `/rest/v1/cotizaciones`**, de las cuales **766 eran exactamente la misma**:

```
GET cotizaciones?select=*,cotizacion_items(*,proveedor:proveedores(nombre),cotizado:trabajadores_cyber(nombre))&order=created_at.desc
```

Dos cosas se juntaron para reventar los 5 GB de egreso:

1. **`select=*` incluía las fotos.** Las imágenes se guardan como texto base64
   dentro de las columnas `cotizaciones.imagen_notas` y `cotizacion_items.imagen`.
   Cada recarga del tablero bajaba **todas las fotos de todas las cotizaciones**,
   aunque el tablero no muestre ni una sola imagen.
2. **Se recargaba cada 12 segundos, siempre.** El `setInterval` corría aunque
   nada hubiera cambiado y aunque la pestaña estuviera en segundo plano. Una
   pestaña olvidada abierta toda la tarde seguía descargando la tabla completa
   300 veces por hora.

A eso se sumaban dos temporizadores más (actividad y apartados, cada 15 s).

## Los cambios

### 1. `src/components/AppShell.jsx` — el tablero pide solo lo que pinta

El tablero muestra folio, escuela, título, quién solicita, estado, fecha,
cuántos productos hay y el total. Nada más. Así que ahora pide exactamente eso:

```js
const SELECT_TABLERO =
  'select=id,folio,escuela,titulo,solicitante_nombre,estado,created_at,updated_at,cotizacion_items(id,cantidad,precio_final)';
```

Sin `imagen`, sin `notas`, sin `descripcion`, sin los joins de proveedor y
cotizador (que el tablero tampoco muestra). Cada recarga pasa de varios MB a
unos pocos KB.

### 2. `src/supabaseClient.js` — consulta de "firma"

Se agregó `api.firma(tabla)`. Pide una sola fila con una sola columna y usa el
header `Prefer: count=exact` para leer el total desde `Content-Range`. Devuelve
algo como `"47|2026-08-28T23:28:34.125+00:00"`: **total de filas + fecha del
último cambio**, en unos ~100 bytes.

### 3. El tablero ya no recarga a ciegas

El temporizador ahora:

- corre cada **20 s** (antes 12 s),
- **no hace nada si la pestaña está en segundo plano** (`document.hidden`),
- pide primero la firma y **solo baja la lista si la firma cambió**,
- y comprueba de inmediato cuando la ventana vuelve al frente
  (`visibilitychange`), así que al volver a la pestaña la vista está al día.

En un rato sin cambios, el costo real pasa de ~300 descargas de la tabla
completa por hora a ~180 consultas de 100 bytes. Las notificaciones de
escritorio siguen funcionando igual, porque cuando la firma cambia sí se baja
la lista y ahí se compara contra el snapshot anterior.

Los temporizadores de actividad y apartados pasaron de 15 s a 30 s y también se
pausan en segundo plano.

### 4. La bitácora ya no pide eco

`logActividad` usaba `Prefer: return=representation`, así que Supabase devolvía
la fila recién insertada aunque el código la ignorara. Ahora usa
`return=minimal` (`api.postMudo`).

### 5. `src/imageUtils.js` — fotos más ligeras

De 900 px / calidad 0.72 a **720 px / calidad 0.55**. Sigue siendo legible para
una captura de pantalla, y cada foto cuenta doble contra la cuota: ocupa espacio
en la base y se descarga cada vez que alguien abre esa cotización.

Esto solo afecta a las fotos **nuevas**; las ya guardadas quedan como están.

### 6. `optimizacion_egress.sql` — ejecutar una vez

**Hay que correrlo en Supabase → SQL Editor.** Hace dos cosas:

- Crea índices sobre `updated_at` / `created_at` para que la consulta de firma
  sea instantánea.
- Agrega un trigger para que al agregar, editar o borrar un **producto** se
  actualice el `updated_at` de su cotización. Sin esto la firma no cambiaría al
  tocar un producto y el tablero de la otra persona se quedaría con el total
  viejo hasta que alguien apretara F5.

Es seguro correrlo varias veces.

## Qué NO cambió

El detalle de una cotización (`CotizacionDetail`) sigue pidiendo `select=*` con
imágenes y joins: ahí sí se muestran y solo se descarga cuando alguien abre esa
cotización en concreto. Eso está bien.

## Pasos

1. Correr `optimizacion_egress.sql` en el SQL Editor de Supabase.
2. Desplegar el código (`npm run build` y subir, o el push a Vercel de siempre).
3. Pedirle a todos que **recarguen la página con Ctrl+F5**, para que dejen de
   correr las pestañas viejas con el código anterior.
4. Revisar el egreso en Supabase al día siguiente (tarda hasta 1 h en
   actualizarse).

## Si aun así se queda corto

El siguiente paso sería sacar las imágenes de la base y ponerlas en **Supabase
Storage** (1 GB gratis), guardando solo la URL en la columna. Ventajas: no
inflan la base, se sirven con caché del navegador (el egreso en caché tiene su
propia cuota de 5 GB) y no viajan en base64, que pesa un 33 % más que el
archivo original. Es un cambio más grande y con los arreglos de arriba
probablemente no haga falta todavía.
