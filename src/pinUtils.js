// El PIN nunca se guarda ni se compara en texto plano: se convierte a un
// hash SHA-256 (irreversible) tanto al ponerlo como al verificarlo.
export async function hashPin(pin) {
  const clean = pin.trim();
  const enc = new TextEncoder().encode(clean);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
