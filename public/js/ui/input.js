// Mouse e tastiera sulla mappa: clic, clic destro, trascinamento, rotella, tasti.
export function attachInput(canvas, h) {
  let down = null;
  canvas.addEventListener('mousedown', e => {
    if (e.button === 0) down = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, drag: false };
  });
  window.addEventListener('mousemove', e => {
    if (!down) return;
    if (!down.drag && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) down.drag = true;
    if (down.drag) {
      h.onPan(e.clientX - down.lastX, e.clientY - down.lastY);
      down.lastX = e.clientX;
      down.lastY = e.clientY;
    }
  });
  window.addEventListener('mouseup', e => {
    if (!down) return;
    const wasDrag = down.drag;
    down = null;
    if (!wasDrag && e.button === 0) {
      const r = canvas.getBoundingClientRect();
      h.onClick(e.clientX - r.left, e.clientY - r.top);
    }
  });
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    h.onRightClick(e.clientX - r.left, e.clientY - r.top);
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    h.onZoom(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  window.addEventListener('keydown', e => {
    if (e.target.closest?.('input, textarea')) return;
    if (h.onKey(e.key)) e.preventDefault();
  });
}
