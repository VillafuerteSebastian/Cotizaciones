// Redimensiona una imagen en el navegador antes de guardarla (evita
// mandar fotos de varios MB a la base de datos). Devuelve un data URL
// JPEG listo para guardar en la columna `imagen`.
//
// Las medidas son deliberadamente modestas: la foto solo se ve como
// miniatura y, al ampliarla, en una ventana. 720 px de ancho basta para
// leer una captura de pantalla, y cada foto guardada se descarga cada vez
// que alguien abre esa cotización, así que su peso cuenta doble contra la
// cuota del plan gratuito (espacio en la base y egreso).
export function resizeImageToDataUrl(file, maxWidth = 720, quality = 0.55) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo procesar la imagen'));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
