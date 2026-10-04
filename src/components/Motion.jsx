import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Animaciones compartidas (Framer Motion) para overlays, ventanas modales
 * y transiciones de contenido. Solo afecta lo visual: mismas clases CSS,
 * mismos props/eventos, ningún cambio de lógica de negocio.
 *
 * Las ventanas modales usan MotionOverlay/MotionModal en vez de un <div>
 * plano. Donde el punto donde se monta/desmonta la ventana está envuelto
 * en <AnimatePresence>, además de la entrada también anima la salida.
 */

export const overlayFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0.15, ease: 'easeIn' } },
  transition: { duration: 0.18, ease: 'easeOut' },
};

export const modalPop = {
  initial: { opacity: 0, y: 16, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 10, scale: 0.98, transition: { duration: 0.14, ease: 'easeIn' } },
  transition: { type: 'spring', stiffness: 380, damping: 30, mass: 0.9 },
};

// Transición de contenido al cambiar de pestaña en el panel principal.
export const tabFade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8, transition: { duration: 0.12, ease: 'easeIn' } },
  transition: { duration: 0.2, ease: 'easeOut' },
};

function joinClass(...parts) {
  return parts.filter(Boolean).join(' ');
}

// Ventanas abiertas que se cierran con Esc, en el orden en que se abrieron.
// Esc solo cierra la de más arriba (p. ej. la confirmación de "¿Eliminar?"
// y no también el apartado que está detrás).
const pilaEscape = [];
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || !pilaEscape.length) return;
    e.preventDefault();
    pilaEscape[pilaEscape.length - 1].current();
  });
}

// Las ventanas se cierran al hacer clic en el fondo. Pero si se presiona
// dentro de la ventana (por ejemplo, seleccionando texto para copiarlo o
// borrarlo) y se suelta fuera, el navegador manda el "click" al fondo y la
// ventana se cerraba sola. Por eso el clic en el fondo solo cuenta si también
// se presionó sobre el fondo.
// `onEscape`: qué hacer al presionar Esc con esta ventana encima (cerrarla).
export function MotionOverlay({ className = '', children, onPointerDown, onClick, onEscape, ...rest }) {
  const presionEnFondo = useRef(false);
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  const tieneEscape = Boolean(onEscape);
  useEffect(() => {
    if (!tieneEscape) return undefined;
    const entrada = { current: () => escapeRef.current && escapeRef.current() };
    pilaEscape.push(entrada);
    return () => {
      const i = pilaEscape.indexOf(entrada);
      if (i !== -1) pilaEscape.splice(i, 1);
    };
  }, [tieneEscape]);
  return (
    <motion.div
      className={joinClass('modal-overlay', className)}
      {...overlayFade}
      {...rest}
      onPointerDown={(e) => {
        presionEnFondo.current = e.target === e.currentTarget;
        if (onPointerDown) onPointerDown(e);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !presionEnFondo.current) {
          // Igual que un clic dentro de la ventana: no debe llegar a lo de atrás.
          e.stopPropagation();
          return;
        }
        if (onClick) onClick(e);
      }}
    >
      {children}
    </motion.div>
  );
}

export function MotionModal({ className = '', children, ...rest }) {
  return (
    <motion.div className={joinClass('modal', className)} {...modalPop} {...rest}>
      {children}
    </motion.div>
  );
}

export { motion, AnimatePresence };
