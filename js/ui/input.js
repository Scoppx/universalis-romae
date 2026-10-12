// Mouse e tastiera sulla mappa: clic, clic destro, trascinamento, rotella, tasti.
export function attachInput(canvas, h) {
  let down = null;
  canvas.addEventListener('mousedown', e => {
    if (e.button === 0) down = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, drag: false, box: e.shiftKey };
  });
  const rect = e => {
    const r = canvas.getBoundingClientRect();
    return { x0: down.x - r.left, y0: down.y - r.top, x1: e.clientX - r.left, y1: e.clientY - r.top };
  };
  window.addEventListener('mousemove', e => {
    if (!down) return;
    if (!down.drag && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) down.drag = true;
    if (!down.drag) return;
    if (down.box) { h.onBoxMove?.(rect(e)); return; }
    h.onPan(e.clientX - down.lastX, e.clientY - down.lastY);
    down.lastX = e.clientX;
    down.lastY = e.clientY;
  });
  window.addEventListener('mouseup', e => {
    if (!down) return;
    const d = down;
    if (d.box && d.drag) { const rr = rect(e); down = null; h.onBox?.(rr); return; }
    down = null;
    if (!d.drag && e.button === 0) {
      const r = canvas.getBoundingClientRect();
      h.onClick(e.clientX - r.left, e.clientY - r.top, { shift: e.shiftKey });
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
