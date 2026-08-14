import React, { useState } from 'react';
import { resizeImageToDataUrl } from '../imageUtils.js';
import { ImageThumb } from './ImageViewer.jsx';

// Campo para adjuntar una imagen: se puede pegar (Ctrl+V, útil para
// capturas de pantalla de Excel u otras fuentes) o elegir un archivo.
export default function ImagenInput({ value, onChange, label = 'Foto (opcional)', quitarLabel = 'Quitar' }) {
  const [busy, setBusy] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      onChange(dataUrl);
    } catch (ex) {
      alert(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault();
        handleFile(item.getAsFile());
        return;
      }
    }
  };

  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <label>{label}</label>
      {value && (
        <div className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <ImageThumb src={value} alt="captura" size={90} />
          <button type="button" className="link-btn" onClick={() => onChange(null)}>
            {quitarLabel}
          </button>
        </div>
      )}
      <div
        tabIndex={0}
        onPaste={handlePaste}
        style={{
          border: '1px dashed var(--line)',
          borderRadius: 8,
          padding: '8px 10px',
          fontSize: 12.5,
          color: 'var(--ink-soft)',
          marginBottom: 6,
          outline: 'none',
        }}
      >
        {busy ? 'Procesando…' : 'Haz clic aquí y pega una imagen copiada (Ctrl+V), o elige un archivo abajo'}
      </div>
      <input type="file" accept="image/*" disabled={busy} onChange={(e) => handleFile(e.target.files[0])} />
    </div>
  );
}
