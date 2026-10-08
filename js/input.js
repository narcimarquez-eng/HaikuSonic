// Entrada: teclado, joystick táctil y botones SALTAR / SPIN
export const input = { x: 0, y: 0, touchJump: false, touchSpin: false, jumpPressed: false, spinPressed: false };

const JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW', 'KeyZ'];
const SPIN_KEYS = ['KeyX', 'ShiftLeft', 'ShiftRight', 'KeyC'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD'], LEFT_KEYS = ['ArrowLeft', 'KeyA'], DOWN_KEYS = ['ArrowDown', 'KeyS'];
const keys = new Set();

export const isJumpHeld = () => input.touchJump || JUMP_KEYS.some((k) => keys.has(k));
export const isSpinHeld = () => input.touchSpin || SPIN_KEYS.some((k) => keys.has(k));
export const readAxisX = () => {
  if (Math.abs(input.x) > 0.12) return input.x;
  return (RIGHT_KEYS.some((k) => keys.has(k)) ? 1 : 0) - (LEFT_KEYS.some((k) => keys.has(k)) ? 1 : 0);
};
export const readDown = () => input.y > 0.55 || isSpinHeld() || DOWN_KEYS.some((k) => keys.has(k));

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if ([...JUMP_KEYS, ...SPIN_KEYS, ...RIGHT_KEYS, ...LEFT_KEYS, ...DOWN_KEYS].includes(e.code)) e.preventDefault();
    if (!e.repeat) {
      if (JUMP_KEYS.includes(e.code)) input.jumpPressed = true;
      if (SPIN_KEYS.includes(e.code)) input.spinPressed = true;
    }
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  // Joystick: arrastra el mando dentro del círculo; y positivo = abajo
  const joy = document.getElementById('joy');
  const knob = document.getElementById('knob');
  let joyPointer = null;
  const joyMove = (e) => {
    const r = joy.getBoundingClientRect();
    const max = r.width / 2 * 0.6;
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.x = dx / max;
    input.y = dy / max;
  };
  const joyEnd = (e) => {
    if (e.pointerId !== joyPointer) return;
    joyPointer = null; input.x = 0; input.y = 0;
    knob.style.transform = 'translate(0px, 0px)';
  };
  joy.addEventListener('pointerdown', (e) => { e.preventDefault(); joyPointer = e.pointerId; joy.setPointerCapture(e.pointerId); joyMove(e); });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyPointer) joyMove(e); });
  joy.addEventListener('pointerup', joyEnd);
  joy.addEventListener('pointercancel', joyEnd);

  const bindHold = (el, onDown, onUp) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); onDown(); el.classList.add('on'); });
    const end = () => { onUp(); el.classList.remove('on'); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  };
  bindHold(document.getElementById('jump'), () => { input.touchJump = true; input.jumpPressed = true; }, () => { input.touchJump = false; });
  bindHold(document.getElementById('spin'), () => { input.touchSpin = true; input.spinPressed = true; }, () => { input.touchSpin = false; });
}
