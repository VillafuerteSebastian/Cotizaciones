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

export function MotionOverlay({ className = '', children, ...rest }) {
  return (
    <motion.div className={joinClass('modal-overlay', className)} {...overlayFade} {...rest}>
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
