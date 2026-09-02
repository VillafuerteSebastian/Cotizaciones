import React, { useState } from 'react';
import { api } from '../supabaseClient.js';
import { ImageThumb } from './ImageViewer.jsx';
import { useUI } from './UIProvider.jsx';

// Las fotos se guardan como texto base64 dentro de la base de datos, así que
// cada una pesa decenas de KB y se descarga entera cada vez que alguien abre
// la cotización — aunque solo se vea como una miniatura de 46 px, o aunque
// nadie la mire.
//
// Este componente no descarga nada al abrir la cotización: muestra un botón
// y solo pide la foto a Supabase cuando alguien realmente quiere verla.
// Una vez cargada se comporta igual que antes (miniatura + clic para ampliar).
//
//   tabla:    'cotizacion_items' | 'cotizaciones'
//   id:       id de la fila
//   columna:  'imagen' | 'imagen_notas'
//   hay:      booleano de la columna generada (tiene_imagen / tiene_imagen_notas)
export default function ImagenPerezosa({ tabla, id, columna, hay, alt, size = 46, style, onCargada }) {
  const { toast } = useUI();
  const [src, setSrc] = useState(null);
  const [cargando, setCargando] = useState(false);

  if (!hay) return null;
  if (src) return <ImageThumb src={src} alt={alt} size={size} style={style} />;

  const cargar = async (e) => {
    e.stopPropagation();
    if (cargando) return;
    setCargando(true);
    try {
      const filas = await api.get(`${tabla}?id=eq.${id}&select=${columna}`);
      const dataUrl = filas && filas[0] ? filas[0][columna] : null;
      if (!dataUrl) {
        toast('Esa foto ya no está disponible.', 'error');
        return;
      }
      setSrc(dataUrl);
      if (onCargada) onCargada(dataUrl);
    } catch (ex) {
      toast('No se pudo cargar la foto: ' + ex.message, 'error');
    } finally {
      setCargando(false);
    }
  };

  return (
    <button
      type="button"
      className="foto-lazy"
      onClick={cargar}
      disabled={cargando}
      title="Cargar y ver la foto"
      style={style}
    >
      {cargando ? '⏳ Cargando…' : '📷 Ver foto'}
    </button>
  );
}
