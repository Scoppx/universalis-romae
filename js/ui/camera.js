// Trasformazione mappa → schermo: schermo = mondo * scale + (x, y).
export function createCamera(viewW, viewH, worldW, worldH) {
  const fit = Math.min(viewW / worldW, viewH / worldH);
  return { scale: fit, x: (viewW - worldW * fit) / 2, y: (viewH - worldH * fit) / 2, min: fit * 0.8, max: fit * 8 };
}

export function toWorld(cam, sx, sy) {
  return [(sx - cam.x) / cam.scale, (sy - cam.y) / cam.scale];
}

export function toScreen(cam, wx, wy) {
  return [wx * cam.scale + cam.x, wy * cam.scale + cam.y];
}

// Lo zoom tiene fermo il punto sotto il cursore.
export function zoomAt(cam, sx, sy, factor) {
  const [wx, wy] = toWorld(cam, sx, sy);
  cam.scale = Math.max(cam.min, Math.min(cam.max, cam.scale * factor));
  cam.x = sx - wx * cam.scale;
  cam.y = sy - wy * cam.scale;
}

export function pan(cam, dx, dy) {
  cam.x += dx;
  cam.y += dy;
}

export function centerOn(cam, viewW, viewH, wx, wy) {
  cam.x = viewW / 2 - wx * cam.scale;
  cam.y = viewH / 2 - wy * cam.scale;
}
