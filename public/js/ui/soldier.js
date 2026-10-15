// Soldatino vettoriale (piedi in x, y), etichetta con uomini e morale, freccia del percorso. Coordinate schermo.
const INCHIOSTRO = '#2b2118';

export function drawSoldier(ctx, { x, y, colore, dir = 1, fase = 0, scala = 1, scelto = false, inMarcia = false, battaglia = false, assedio = false }) {
  if (assedio) drawTent(ctx, x - 17 * scala * dir, y, scala);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(30, 20, 10, 0.35)';
  ctx.beginPath(); ctx.ellipse(0, 1, 9 * scala, 3 * scala, 0, 0, Math.PI * 2); ctx.fill();
  if (scelto) {
    ctx.strokeStyle = '#fff6d0'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, 1, 14 * scala, 5.5 * scala, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.scale(scala * dir, scala);
  const passo = inMarcia ? Math.sin(fase) : 0;
  ctx.translate(0, inMarcia ? -Math.abs(Math.sin(fase)) * 1.5 : 0);
  ctx.lineCap = 'round';
  // gambe
  ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-1.5, -9); ctx.lineTo(-2.5 + passo * 3, 0);
  ctx.moveTo(1.5, -9); ctx.lineTo(2.5 - passo * 3, 0);
  ctx.stroke();
  // lancia, che in battaglia affonda
  const affondo = battaglia ? Math.max(0, Math.sin(fase * 2)) * 4 : 0;
  ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-4 + affondo, -31); ctx.lineTo(-4 + affondo, 1); ctx.stroke();
  ctx.fillStyle = '#cfcabe';
  ctx.beginPath(); ctx.moveTo(-4 + affondo, -35); ctx.lineTo(-5.8 + affondo, -30); ctx.lineTo(-2.2 + affondo, -30); ctx.closePath(); ctx.fill();
  // tunica
  ctx.fillStyle = colore; ctx.strokeStyle = INCHIOSTRO; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(-5, -20, 10, 12, 2); ctx.fill(); ctx.stroke();
  // testa, elmo e cresta
  ctx.fillStyle = '#e2b48c';
  ctx.beginPath(); ctx.arc(0, -23.5, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#b08d3c';
  ctx.beginPath(); ctx.arc(0, -24.5, 3.9, Math.PI, 0); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = colore; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(-3, -29); ctx.quadraticCurveTo(0, -31.5, 3, -29); ctx.stroke();
  // scudo davanti
  ctx.fillStyle = colore; ctx.strokeStyle = INCHIOSTRO; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(5, -14, 4.2, 6.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d8c48a';
  ctx.beginPath(); ctx.arc(5, -14, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (battaglia) drawDust(ctx, x + 11 * scala * dir, y - 5 * scala, fase, scala);
}

function drawTent(ctx, x, y, s) {
  ctx.save();
  ctx.fillStyle = '#e8dcc0'; ctx.strokeStyle = INCHIOSTRO; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x - 7 * s, y); ctx.lineTo(x, y - 11 * s); ctx.lineTo(x + 7 * s, y); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - 11 * s); ctx.lineTo(x, y); ctx.stroke();
  ctx.restore();
}

function drawDust(ctx, x, y, fase, s) {
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const t = (fase * 0.7 + i / 3) % 1;
    ctx.fillStyle = `rgba(200, 180, 140, ${0.6 * (1 - t)})`;
    ctx.beginPath(); ctx.arc(x + Math.cos(i * 2.1) * 6 * t * s, y - 6 * t * s, (2 + 5 * t) * s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function drawLabel(ctx, x, y, uomini, morale, moraleMax, s = 1) {
  const testo = uomini >= 1000 ? `${(uomini / 1000).toFixed(1)}k` : String(uomini);
  ctx.save();
  ctx.font = `bold ${Math.round(10 * s)}px Georgia`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(testo).width + 8;
  ctx.fillStyle = 'rgba(43, 33, 24, 0.85)';
  ctx.beginPath(); ctx.roundRect(x - w / 2, y + 4, w, 13 * s, 3); ctx.fill();
  ctx.fillStyle = '#f6eedb';
  ctx.fillText(testo, x, y + 4 + 6.5 * s);
  const q = Math.max(0, Math.min(1, morale / moraleMax));
  ctx.fillStyle = 'rgba(43, 33, 24, 0.6)'; ctx.fillRect(x - 11, y + 5 + 13 * s, 22, 3);
  ctx.fillStyle = q > 0.6 ? '#5f8f3a' : q > 0.3 ? '#c9a227' : '#b03a2e';
  ctx.fillRect(x - 11, y + 5 + 13 * s, 22 * q, 3);
  ctx.restore();
}

export function drawArrow(ctx, [x1, y1], [x2, y2], testo) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.strokeStyle = '#8b1e1e'; ctx.fillStyle = '#8b1e1e'; ctx.lineWidth = 2.5;
  ctx.setLineDash([7, 4]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - Math.cos(ang) * 8, y2 - Math.sin(ang) * 8); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - Math.cos(ang - 0.45) * 11, y2 - Math.sin(ang - 0.45) * 11);
  ctx.lineTo(x2 - Math.cos(ang + 0.45) * 11, y2 - Math.sin(ang + 0.45) * 11);
  ctx.closePath(); ctx.fill();
  if (testo) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    ctx.font = 'bold 11px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(testo).width + 8;
    ctx.fillStyle = '#f6eedb'; ctx.strokeStyle = '#8b1e1e'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(mx - w / 2, my - 8, w, 16, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8b1e1e'; ctx.fillText(testo, mx, my);
  }
  ctx.restore();
}

// "+N": eserciti dello stesso popolo nella provincia che non sono disegnati.
export function drawMore(ctx, x, y, n, s = 1) {
  const testo = `+${n}`;
  ctx.save();
  ctx.font = `bold ${Math.round(10 * s)}px Georgia`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(testo).width + 8;
  ctx.fillStyle = 'rgba(43, 33, 24, 0.85)';
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - 7 * s, w, 14 * s, 7 * s); ctx.fill();
  ctx.fillStyle = '#f6eedb';
  ctx.fillText(testo, x, y);
  ctx.restore();
}

// Simbolo d'assedio: una piccola fortezza con i giorni rimasti.
export function drawFortress(ctx, x, y, giorni, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(43, 33, 24, 0.9)';
  ctx.strokeStyle = '#f6eedb';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-9, 6); ctx.lineTo(-9, -6); ctx.lineTo(-6, -6); ctx.lineTo(-6, -3); ctx.lineTo(-2, -3); ctx.lineTo(-2, -6);
  ctx.lineTo(2, -6); ctx.lineTo(2, -3); ctx.lineTo(6, -3); ctx.lineTo(6, -6); ctx.lineTo(9, -6); ctx.lineTo(9, 6); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.font = 'bold 9px Georgia';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f6eedb';
  ctx.fillText(giorni === null ? '—' : `${giorni}g`, 0, 1);
  ctx.restore();
}
