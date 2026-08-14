// Notificaciones de escritorio (usa la Notification API del navegador).
// Funcionan mientras la pestaña de la app esté abierta (puede estar
// minimizada o en segundo plano), incluso en Windows aparecen como toast
// del sistema. No funcionan si el navegador está completamente cerrado.

export function soportaNotificaciones() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function permisoNotificaciones() {
  return soportaNotificaciones() ? Notification.permission : 'unsupported';
}

export async function pedirPermisoNotificaciones() {
  if (!soportaNotificaciones()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function mostrarNotificacion(title, options) {
  if (!soportaNotificaciones() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (ex) {
    console.warn('No se pudo mostrar la notificación:', ex.message);
  }
}
