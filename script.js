/* ---------- ÉTAT ---------------------------------------------------- */
const etat = {
  f: 5, angle: 20, pol: "TE",
  couches: [{ mat: "beton", d: 20 }], sel: 0, dist: 8,
  enMarche: true, champDb: false
};

const SW = {
  brique: "repeating-linear-gradient(0deg,#e9d3c4 0 2px,#b5482f 2px 9px)",
  beton:  "radial-gradient(#6f757b 1px,#9aa0a6 1.6px) 0 0/5px 5px",
  bois:   "repeating-linear-gradient(115deg,#b07a47 0 4px,#8d5c2f 4px 5px)",
  placo:  "radial-gradient(#ffffff 1px,#e8e1d0 1.6px) 0 0/5px 5px",
  verre:  "linear-gradient(135deg,#d4f1f8,#62b7cc)",
  air:    "#e4f4fb",
  metal:  "linear-gradient(90deg,#c6ced3,#7d8a92)"
};
const cur = () => etat.couches[etat.sel];
const PRESETS = {
  beton:   [{ mat: "beton", d: 20 }],
  vitrage: [{ mat: "verre", d: 0.4 }, { mat: "air", d: 1.6 }, { mat: "verre", d: 0.4 }],
  cloison: [{ mat: "placo", d: 1.3 }, { mat: "air", d: 7 }, { mat: "placo", d: 1.3 }]
};
/* Position (en pixels) de chaque couche dans le schéma */
function geomMur() {
  let x = 260;
  return etat.couches.map(c => { const w = 6 + Math.min(c.d, 40) / 40 * 90; const b = { x0: x, x1: x + w }; x += w; return b; });
}

/* ---------- 3. DESSIN ----------------------------------------------- */
const scene = document.getElementById("scene");
const sc = scene.getContext("2d");
const chart = document.getElementById("chart");
const ch = chart.getContext("2d");
const champ = document.getElementById("champ"), cc = champ.getContext("2d");

const COL = { teal: "#0b8a83", coral: "#d9573f", amber: "#c08a1c", ink: "#12232b", muted: "#5d7079", line: "#d5dedc" };

/* Couleurs de la scène (style "verre et lumière") */
const CY = "#2fc0ea", CO = "#ff6f58", MI = "#3fd49b";

/* Onde sinusoïdale + halo lumineux autour du faisceau */
function faisceau(x0, y0, ux, uy, longueur, amp, couleur, t, lambdaPx) {
  if (amp < 0.01) return;
  sc.save();
  sc.globalAlpha = 0.10 + 0.12 * amp;
  sc.strokeStyle = couleur; sc.lineCap = "round";
  sc.lineWidth = 10 + 36 * amp;
  sc.beginPath(); sc.moveTo(x0, y0); sc.lineTo(x0 + ux * longueur, y0 + uy * longueur); sc.stroke();
  sc.restore();

  const k = 2 * Math.PI / lambdaPx, nx = -uy, ny = ux, A = 16 * amp;
  sc.strokeStyle = couleur; sc.lineWidth = 1.8 + 1.8 * amp; sc.lineCap = "round";
  sc.beginPath();
  for (let s = 0; s <= longueur; s += 3) {
    const off = A * Math.sin(k * s - 6 * t);
    const x = x0 + ux * s + nx * off, y = y0 + uy * s + ny * off;
    if (s === 0) sc.moveTo(x, y); else sc.lineTo(x, y);
  }
  sc.stroke();
}

function etiquette(texte, x, y, couleur, align) {
  sc.font = "600 15px system-ui, sans-serif";
  sc.textAlign = align || "left";
  sc.fillStyle = couleur;
  sc.fillText(texte, x, y);
}

/* Pastille blanche avec ombre douce et point coloré */
function pastille(txt, x, y, col) {
  sc.font = "600 15px system-ui, sans-serif";
  const w = sc.measureText(txt).width + 42, h = 34;
  sc.save();
  sc.shadowColor = "rgba(18,35,43,.16)"; sc.shadowBlur = 14; sc.shadowOffsetY = 4;
  sc.fillStyle = "#fff";
  sc.beginPath(); sc.roundRect(x - w / 2, y - h / 2, w, h, 17); sc.fill();
  sc.restore();
  sc.fillStyle = col;
  sc.beginPath(); sc.arc(x - w / 2 + 17, y, 4.5, 0, 7); sc.fill();
  sc.textAlign = "left"; sc.fillStyle = COL.ink;
  sc.fillText(txt, x - w / 2 + 30, y + 5);
}

/* Texture brique : rangées de briques décalées, joints clairs, légère variation de teinte */
function motifBrique(b, haut, bas) {
  const w = b.x1 - b.x0, bh = 22, bw = 46;
  sc.save(); sc.beginPath(); sc.rect(b.x0, haut, w, bas - haut); sc.clip();
  sc.fillStyle = "#e9d3c4"; sc.fillRect(b.x0, haut, w, bas - haut);              // joints
  for (let r = 0, y = haut; y < bas; r++, y += bh) {
    const dec = (r % 2) * bw / 2;
    for (let x = b.x0 - dec, c = 0; x < b.x1; x += bw, c++) {
      const v = ((r * 7 + c * 13) % 5) * 5;                                        // teinte un peu différente
      sc.fillStyle = "rgb(" + (176 + v) + "," + (68 + v) + "," + (46 + v) + ")";
      sc.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
    }
  }
  sc.restore();
}

/* Texture réaliste de chaque matériau (vue en coupe) */
function texture(k, b, haut, bas) {
  if (k === "brique") return motifBrique(b, haut, bas);
  const w = b.x1 - b.x0, h = bas - haut;
  const alea = i => { const v = Math.sin(i * 12.9898) * 43758.5453; return v - Math.floor(v); };   // hasard stable
  sc.save(); sc.beginPath(); sc.rect(b.x0, haut, w, h); sc.clip();
  if (k === "beton" || k === "placo") {
    sc.fillStyle = k === "beton" ? "#9aa0a6" : "#e8e1d0"; sc.fillRect(b.x0, haut, w, h);
    for (let i = 0; i < w * h / (k === "beton" ? 70 : 110); i++) {
      sc.fillStyle = k === "beton" ? (alea(i) > 0.5 ? "#6f757b" : "#c8cdd1") : (alea(i) > 0.4 ? "#ffffff" : "#d2c8b2");
      sc.beginPath(); sc.arc(b.x0 + alea(i + 7.1) * w, haut + alea(i + 3.3) * h, 0.9 + alea(i + 9.7) * 1.5, 0, 7); sc.fill();
    }
  } else if (k === "bois") {
    sc.fillStyle = "#b07a47"; sc.fillRect(b.x0, haut, w, h);
    sc.strokeStyle = "rgba(85,45,15,0.45)"; sc.lineWidth = 1.5;
    for (let y = haut - w; y < bas + w; y += 13) { sc.beginPath(); sc.moveTo(b.x0, y); sc.lineTo(b.x1, y - 0.5 * w); sc.stroke(); }
    sc.strokeStyle = "rgba(255,225,170,0.25)";
    for (let y = haut - w + 6; y < bas + w; y += 13) { sc.beginPath(); sc.moveTo(b.x0, y); sc.lineTo(b.x1, y - 0.5 * w); sc.stroke(); }
  } else if (k === "verre") {
    const g = sc.createLinearGradient(b.x0, 0, b.x1 + 1, 0); g.addColorStop(0, "#c9eef6"); g.addColorStop(1, "#5db4ca");
    sc.fillStyle = g; sc.fillRect(b.x0, haut, w, h);
    sc.fillStyle = "rgba(255,255,255,0.35)";
    [0.15, 0.55].forEach(f => { const y = haut + h * f; sc.beginPath(); sc.moveTo(b.x0, y + 90); sc.lineTo(b.x1, y); sc.lineTo(b.x1, y + 40); sc.lineTo(b.x0, y + 130); sc.fill(); });
  } else if (k === "metal") {
    const g = sc.createLinearGradient(b.x0, 0, b.x1 + 1, 0); g.addColorStop(0, "#cfd6da"); g.addColorStop(1, "#7d8a92");
    sc.fillStyle = g; sc.fillRect(b.x0, haut, w, h);
    sc.strokeStyle = "rgba(255,255,255,0.35)"; sc.lineWidth = 1;
    for (let x = b.x0 + 3; x < b.x1; x += 4) { sc.beginPath(); sc.moveTo(x, haut); sc.lineTo(x, bas); sc.stroke(); }
  } else {                                                                              // air
    const g = sc.createLinearGradient(b.x0, 0, b.x1 + 1, 0); g.addColorStop(0, "rgba(205,236,250,0.75)"); g.addColorStop(1, "rgba(240,250,255,0.55)");
    sc.fillStyle = g; sc.fillRect(b.x0, haut, w, h);
  }
  sc.restore();
}

/* Onde à l'intérieur d'une couche : amplitude a0 -> a1 le long du segment */
function ondeInterne(x0, y0, x1, y1, a0, a1, couleur, t, lam, alpha) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 2 || a0 < 0.02) return;
  const dx = (x1 - x0) / len, dy = (y1 - y0) / len, k = 2 * Math.PI / lam;
  const g = Math.log(Math.max(a1, 1e-4) / a0);
  sc.save(); sc.globalAlpha = alpha || 1; sc.strokeStyle = couleur; sc.lineWidth = 2; sc.lineCap = "round"; sc.beginPath();
  for (let q = 0; q <= len; q += 2) {
    const a = a0 * Math.exp(g * q / len), off = 14 * a * Math.sin(k * q - 6 * t);
    const x = x0 + dx * q - dy * off, y = y0 + dy * q + dx * off;
    if (q === 0) sc.moveTo(x, y); else sc.lineTo(x, y);
  }
  sc.stroke(); sc.restore();
}

function dessinerScene(t) {
  const W = scene.width, H = scene.height;
  sc.clearRect(0, 0, W, H);

  const res = calcul(etat.f, etat.angle, etat.couches, etat.pol);
  const th = etat.angle * Math.PI / 180;
  const ux = Math.cos(th), uy = Math.sin(th);

  const bandes = geomMur();
  const xG = bandes[0].x0, xD = bandes[bandes.length - 1].x1;
  const cx = (xG + xD) / 2, cy = 215, haut = 40, bas = H - 75;
  const L = Math.min(300, uy > 0.01 ? 165 / uy : 300, (xG - 30) / Math.max(ux, 0.05), (W - 50 - xD) / Math.max(ux, 0.05));
  const lambdaPx = 150 / etat.f;

  // Grille de fond
  sc.strokeStyle = "rgba(18,35,43,0.05)"; sc.lineWidth = 1;
  for (let x = 0; x < W; x += 24) { sc.beginPath(); sc.moveTo(x, 0); sc.lineTo(x, H); sc.stroke(); }
  for (let y = 0; y < H; y += 24) { sc.beginPath(); sc.moveTo(0, y); sc.lineTo(W, y); sc.stroke(); }

  // Ombre au sol
  const rx = 120 + (xD - xG) / 2;
  const g = sc.createRadialGradient(cx, bas + 8, 5, cx, bas + 8, rx);
  g.addColorStop(0, "rgba(18,35,43,0.22)"); g.addColorStop(1, "rgba(18,35,43,0)");
  sc.save(); sc.translate(0, bas + 8); sc.scale(1, 0.14); sc.translate(0, -(bas + 8));
  sc.fillStyle = g; sc.beginPath(); sc.arc(cx, bas + 8, rx, 0, 7); sc.fill(); sc.restore();

  // Normale (pointillés)
  sc.setLineDash([5, 6]); sc.strokeStyle = "rgba(18,35,43,0.35)"; sc.lineWidth = 1.2;
  sc.beginPath(); sc.moveTo(xG - 150, cy); sc.lineTo(xG, cy); sc.moveTo(xD, cy); sc.lineTo(xD + 150, cy); sc.stroke();
  sc.setLineDash([]);

  // Mur : côté sombre, puis une bande par couche
  sc.fillStyle = "rgba(18,35,43,0.28)";
  sc.beginPath(); sc.moveTo(xD, haut); sc.lineTo(xD + 14, haut - 8); sc.lineTo(xD + 14, bas - 8); sc.lineTo(xD, bas); sc.fill();
  etat.couches.forEach((c, i) => {
    const b = bandes[i], m = MATERIALS[c.mat];
    texture(c.mat, b, haut, bas);
    sc.strokeStyle = "rgba(255,255,255,0.85)"; sc.lineWidth = 2;
    sc.strokeRect(b.x0, haut, b.x1 - b.x0, bas - haut);
  });
  const bs = bandes[etat.sel];
  sc.strokeStyle = CY; sc.lineWidth = 3;
  sc.strokeRect(bs.x0, haut, bs.x1 - bs.x0, bas - haut);

  // Ondes à l'intérieur des couches : réfraction, atténuation, absorption, retour
  let yE = cy, aIn = Math.sqrt(Math.max(0, 1 - res.R)), nPrev = 1;
  const k0 = 2 * Math.PI * etat.f * 1e9 / CLIGHT;
  etat.couches.forEach((c, i) => {
    const m = MATERIALS[c.mat], b = bandes[i];
    const sigma = m.a * Math.pow(etat.f, m.b);
    const n = C.sqrt({ re: m.eps, im: sigma / (2 * Math.PI * etat.f * 1e9 * EPS0) });
    const sinT = Math.min(0.99, Math.sin(th) / n.re), cosT = Math.sqrt(1 - sinT * sinT);
    const rIf = Math.abs((nPrev - n.re) / (nPrev + n.re));
    const a0 = aIn * Math.sqrt(Math.max(0, 1 - rIf * rIf));
    const att = Math.exp(-k0 * n.im * (c.d / 100) / cosT);
    const a1 = a0 * att, y0 = yE, y1 = yE + (b.x1 - b.x0) * sinT / cosT;
    const lam = Math.max(6, lambdaPx / n.re), ab = a0 * a0 - a1 * a1;

    sc.save(); sc.beginPath(); sc.rect(b.x0, haut, b.x1 - b.x0, bas - haut); sc.clip();
    if (ab > 0.01) {                                   // tache chaude = énergie absorbée
      const gx = (b.x0 + b.x1) / 2, gy = (y0 + y1) / 2, gr = sc.createRadialGradient(gx, gy, 2, gx, gy, Math.max(45, b.x1 - b.x0));
      gr.addColorStop(0, "rgba(192,138,28," + Math.min(0.55, ab * 1.3) + ")"); gr.addColorStop(1, "rgba(192,138,28,0)");
      sc.fillStyle = gr; sc.fillRect(b.x0, haut, b.x1 - b.x0, bas - haut);
    }
    ondeInterne(b.x0, y0, b.x1, y1, a0, a1, CY, t, lam, 1);                    // onde qui avance
    const rBack = a1 * Math.abs((n.re - 1) / (n.re + 1));
    ondeInterne(b.x1, y1, b.x0, y0, rBack, rBack * att, CO, t, lam, 0.6);      // onde qui revient
    sc.restore();
    aIn = a1; nPrev = n.re; yE = y1;
  });

  // Poignée sur le bord droit de la couche choisie
  sc.save();
  sc.shadowColor = "rgba(18,35,43,.25)"; sc.shadowBlur = 8;
  sc.fillStyle = "#fff"; sc.strokeStyle = CY; sc.lineWidth = 2;
  sc.beginPath(); sc.roundRect(bs.x1 - 8, cy - 20, 16, 40, 8); sc.fill(); sc.stroke();
  sc.restore();
  sc.strokeStyle = CY; sc.lineWidth = 1.5;
  sc.beginPath(); sc.moveTo(bs.x1 - 2, cy - 8); sc.lineTo(bs.x1 - 2, cy + 8); sc.moveTo(bs.x1 + 2, cy - 8); sc.lineTo(bs.x1 + 2, cy + 8); sc.stroke();

  // Faisceaux
  const sx = xG - ux * L, sy = cy - uy * L;
  faisceau(sx, sy, ux, uy, L, 1, CY, t, lambdaPx);
  faisceau(xG, cy, -ux, uy, L, Math.sqrt(res.R), CO, t, lambdaPx);
  faisceau(xD, yE, ux, uy, L, Math.sqrt(res.T), MI, t, lambdaPx);

  // Émetteur
  sc.save(); sc.translate(sx, sy); sc.rotate(th);
  sc.fillStyle = "#dfe7ea"; sc.strokeStyle = "#7d8a92"; sc.lineWidth = 2;
  sc.beginPath(); sc.roundRect(-34, -12, 34, 24, 6); sc.fill(); sc.stroke();
  sc.fillStyle = CY; sc.fillRect(-6, -8, 6, 16);
  sc.restore();

  // Téléphone
  const px = xD + ux * L, py = yE + uy * L;
  sc.fillStyle = "#33454e"; sc.beginPath(); sc.roundRect(px - 11, py - 19, 22, 38, 5); sc.fill();
  sc.fillStyle = "#e9f6f2"; sc.fillRect(px - 8, py - 14, 16, 26);

  // Angle
  sc.strokeStyle = COL.muted; sc.lineWidth = 1.5;
  sc.beginPath(); sc.arc(xG, cy, 46, Math.PI - th, Math.PI, false); sc.stroke();
  etiquette(etat.angle + "°", xG - 54, cy + 22, COL.muted, "right");

  // Titre, pastilles, cote
  const total = etat.couches.reduce((a, c) => a + c.d, 0);
  etiquette(etat.couches.length + " couche" + (etat.couches.length > 1 ? "s" : "") + " · " + total.toFixed(1) + " cm", 16, 24, COL.ink, "left");
  etat.couches.forEach((c, i) => {                       // permittivité ε′ au-dessus de chaque milieu
    const txt = "ε′ " + MATERIALS[c.mat].eps.toFixed(2), bx = (bandes[i].x0 + bandes[i].x1) / 2, by = 30 - (i % 2) * 18;
    sc.font = "600 12px system-ui, sans-serif";
    const tw = sc.measureText(txt).width + 14;
    sc.fillStyle = "#fff"; sc.strokeStyle = i === etat.sel ? CY : "#c9d4d8"; sc.lineWidth = 1.5;
    sc.beginPath(); sc.roundRect(bx - tw / 2, by - 9, tw, 18, 9); sc.fill(); sc.stroke();
    sc.fillStyle = COL.ink; sc.textAlign = "center"; sc.fillText(txt, bx, by + 4);
  });
  pastille("Tx " + (etat.pol === "AVG" ? "moy." : etat.pol), 120, H - 38, CY);
  pastille("R " + (res.R * 100).toFixed(1) + " %", W / 2, H - 38, CO);
  pastille("T " + (res.T * 100).toFixed(1) + " %", W - 120, H - 38, MI);
  sc.strokeStyle = COL.muted; sc.lineWidth = 1.5;
  sc.beginPath(); sc.moveTo(xG, H - 12); sc.lineTo(xD, H - 12);
  sc.moveTo(xG, H - 17); sc.lineTo(xG, H - 7); sc.moveTo(xD, H - 17); sc.lineTo(xD, H - 7); sc.stroke();

  return res;
}

/* Courbes R, T et A en fonction de l'angle, pour le matériau actuel */
function dessinerCourbes() {
  const W = chart.width, H = chart.height, m = { g: 52, d: 16, h: 14, b: 34 };
  const w = W - m.g - m.d, h = H - m.h - m.b, X = a => m.g + a / 90 * w, Y = v => m.h + h - v * h;
  ch.clearRect(0, 0, W, H);
  ch.font = "13px system-ui, sans-serif"; ch.fillStyle = COL.muted; ch.strokeStyle = COL.line; ch.lineWidth = 1; ch.textAlign = "right";
  for (let p = 0; p <= 100; p += 25) { ch.beginPath(); ch.moveTo(m.g, Y(p / 100)); ch.lineTo(m.g + w, Y(p / 100)); ch.stroke(); ch.fillText(p + " %", m.g - 8, Y(p / 100) + 4); }
  ch.textAlign = "center";
  for (let a = 0; a <= 90; a += 15) ch.fillText(a + "°", X(a), H - 12);

  const serie = pol => { const o = []; for (let a = 0; a <= 89; a++) o.push(calcul(etat.f, a, etat.couches, pol)); return o; };
  const chemin = (s, cle) => { ch.beginPath(); s.forEach((r, a) => ch[a ? "lineTo" : "moveTo"](X(a), Y(r[cle]))); };
  const trace = (s, cle, couleur, epais, tirets, remplir) => {
    if (remplir) { chemin(s, cle); ch.lineTo(X(89), Y(0)); ch.lineTo(X(0), Y(0)); ch.closePath(); ch.globalAlpha = 0.1; ch.fillStyle = couleur; ch.fill(); }
    chemin(s, cle); ch.globalAlpha = tirets ? 0.55 : 1; ch.setLineDash(tirets ? [5, 5] : []);
    ch.strokeStyle = couleur; ch.lineWidth = epais; ch.stroke(); ch.setLineDash([]); ch.globalAlpha = 1;
  };
  const cur = serie(etat.pol);
  ["TE", "TM"].forEach(p => { if (p !== etat.pol) { const s = serie(p); trace(s, "R", CO, 1.5, true); trace(s, "T", MI, 1.5, true); } });
  trace(cur, "R", CO, 3, false, true); trace(cur, "T", MI, 3, false, true);

  // angle de Brewster (premier matériau solide)
  const c1 = etat.couches.find(c => MATERIALS[c.mat].eps > 1.05);
  if (c1) {
    const tb = Math.atan(Math.sqrt(MATERIALS[c1.mat].eps)) * 180 / Math.PI;
    ch.setLineDash([3, 4]); ch.strokeStyle = "#0b8a83"; ch.lineWidth = 1.5; ch.beginPath(); ch.moveTo(X(tb), m.h + 14); ch.lineTo(X(tb), m.h + h); ch.stroke(); ch.setLineDash([]);
    const txt = "θB " + tb.toFixed(1) + "°", tw = ch.measureText(txt).width + 14;
    ch.fillStyle = "#fff"; ch.beginPath(); ch.roundRect(X(tb) - tw / 2, m.h - 4, tw, 18, 9); ch.fill(); ch.strokeStyle = "#0b8a83"; ch.stroke();
    ch.fillStyle = "#0b8a83"; ch.font = "600 12px system-ui, sans-serif"; ch.fillText(txt, X(tb), m.h + 9);
  }

  // repère de l'angle actuel
  const xa = X(etat.angle);
  ch.setLineDash([2, 4]); ch.strokeStyle = COL.ink; ch.lineWidth = 1.5; ch.beginPath(); ch.moveTo(xa, m.h); ch.lineTo(xa, m.h + h); ch.stroke(); ch.setLineDash([]);
  [["R", CO], ["T", MI]].forEach(([k, col]) => { ch.fillStyle = "#fff"; ch.strokeStyle = col; ch.lineWidth = 3; ch.beginPath(); ch.arc(xa, Y(cur[Math.min(89, etat.angle)][k]), 6, 0, 7); ch.fill(); ch.stroke(); });

  // légende
  ch.font = "600 13px system-ui, sans-serif"; ch.textAlign = "left";
  ch.fillStyle = CO; ch.fillText("R réfléchie", W - 270, m.h + 40); ch.fillStyle = MI; ch.fillText("T transmise", W - 180, m.h + 40);
  ch.fillStyle = COL.muted; ch.fillText("- - TE / TM", W - 270, m.h + 58);
}

/* Profil du champ |E(z)| : l'onde avant, dans et après le mur */
function dessinerChamp() {
  const W = champ.width, H = champ.height, m = { g: 52, d: 16, h: 26, b: 34 }, w = W - m.g - m.d, h = H - m.h - m.b;
  const D = etat.couches.reduce((a, c) => a + c.d, 0), lam = CLIGHT / (etat.f * 1e9) * 100;
  const zA = -Math.max(3, lam * 0.9), zB = D + Math.max(3, lam * 0.9);
  const P = profilChamp(etat.f, etat.angle, etat.couches, etat.pol === "AVG" ? "TE" : etat.pol, zA);
  if (etat.pol === "AVG") { const Q = profilChamp(etat.f, etat.angle, etat.couches, "TM", zA); P.E = P.E.map((v, i) => Math.sqrt((v * v + Q.E[i] * Q.E[i]) / 2)); }
  P.z.push(D, zB); P.E.push(P.T, P.T);
  const db = etat.champDb, val = v => db ? 20 * Math.log10(Math.max(v, 1e-3)) : v;
  const emax = Math.max(1, ...P.E);
  const y0 = db ? -40 : 0, y1 = db ? Math.max(6, val(emax) + 3) : Math.max(1.25, emax * 1.08);
  const X = z => m.g + (z - zA) / (zB - zA) * w, Yu = u => m.h + h - (Math.min(y1, Math.max(y0, u)) - y0) / (y1 - y0) * h, Y = v => Yu(val(v));
  cc.clearRect(0, 0, W, H);

  // couches (couleur du matériau) et mots AIR
  let z0 = 0;
  etat.couches.forEach(c => {
    cc.fillStyle = MATERIALS[c.mat].couleur + "55"; cc.fillRect(X(z0), m.h, X(z0 + c.d) - X(z0), h);
    cc.strokeStyle = MATERIALS[c.mat].couleur; cc.lineWidth = 1.5; cc.beginPath(); cc.moveTo(X(z0), m.h); cc.lineTo(X(z0), m.h + h); cc.stroke(); z0 += c.d;
  });
  cc.beginPath(); cc.moveTo(X(D), m.h); cc.lineTo(X(D), m.h + h); cc.strokeStyle = "#8c9aa1"; cc.stroke();
  cc.font = "600 12px system-ui, sans-serif"; cc.fillStyle = COL.muted; cc.textAlign = "center";
  cc.fillText("AIR", X(zA / 2), m.h + 14); cc.fillText("AIR", X((D + zB) / 2), m.h + 14);

  // grille et axes
  cc.font = "13px system-ui, sans-serif"; cc.strokeStyle = COL.line; cc.lineWidth = 1; cc.textAlign = "right";
  const pasY = db ? 10 : 0.25;
  for (let u = Math.ceil(y0 / pasY) * pasY; u <= y1; u += pasY) { cc.beginPath(); cc.moveTo(m.g, Yu(u)); cc.lineTo(m.g + w, Yu(u)); cc.stroke(); cc.fillText(db ? u : (+u.toFixed(2)), m.g - 8, Yu(u) + 4); }
  const span = zB - zA, pasX = [1, 2, 5, 10, 20, 50, 100, 200].find(p => span / p <= 7) || 200;
  cc.textAlign = "center";
  for (let z = Math.ceil(zA / pasX) * pasX; z <= zB; z += pasX) cc.fillText(+z.toFixed(1), X(z), H - 12);
  cc.textAlign = "right"; cc.fillText("z (cm)", W - 6, H - 12);
  cc.setLineDash([6, 5]); cc.strokeStyle = "#2fc0ea"; cc.beginPath(); cc.moveTo(m.g, Yu(db ? 0 : 1)); cc.lineTo(m.g + w, Yu(db ? 0 : 1)); cc.stroke(); cc.setLineDash([]);

  // courbe : bleu avant le mur, brun dans le mur, vert après
  cc.beginPath(); P.z.forEach((z, i) => cc[i ? "lineTo" : "moveTo"](X(z), Y(P.E[i]))); cc.lineTo(X(zB), Yu(y0)); cc.lineTo(X(zA), Yu(y0)); cc.closePath();
  cc.globalAlpha = 0.1; cc.fillStyle = "#2fc0ea"; cc.fill(); cc.globalAlpha = 1;
  cc.lineWidth = 3; cc.lineCap = "round";
  for (let i = 1; i < P.z.length; i++) {
    const zm = (P.z[i] + P.z[i - 1]) / 2;
    cc.strokeStyle = zm < 0 ? "#2fc0ea" : zm > D ? "#3fd49b" : "#a86a1e";
    cc.beginPath(); cc.moveTo(X(P.z[i - 1]), Y(P.E[i - 1])); cc.lineTo(X(P.z[i]), Y(P.E[i])); cc.stroke();
  }
  champ._P = P;
}

/* ---------- RÉSULTATS (texte à droite) ------------------------------ */
function pct(x) { return Math.round(x * 100) + " %"; }

function qualite(dbm) {
  if (dbm > -50) return "Excellent signal";
  if (dbm > -60) return "Bon signal";
  if (dbm > -70) return "Signal moyen";
  if (dbm > -80) return "Signal faible";
  return "Signal presque nul";
}

function afficherResultats(res) {
  document.getElementById("rVal").textContent = pct(res.R);
  document.getElementById("aVal").textContent = pct(res.A);
  document.getElementById("tVal").textContent = pct(res.T);
  document.getElementById("gR").style.setProperty("--p", res.R * 100);
  document.getElementById("gT").style.setProperty("--p", res.T * 100);
  document.getElementById("chipF").textContent = etat.f.toFixed(2) + " GHz";
  document.getElementById("chipP").textContent = etat.pol === "AVG" ? "Moy." : etat.pol;
  document.getElementById("chipR").textContent = (res.R * 100).toFixed(1) + " %";
  document.getElementById("chipT").textContent = (res.T * 100).toFixed(1) + " %";
  document.getElementById("bR").style.width = res.R * 100 + "%";
  document.getElementById("bA").style.width = res.A * 100 + "%";
  document.getElementById("bT").style.width = res.T * 100 + "%";

  const libre = niveauSansMur(etat.f, etat.dist);
  const perteMur = -10 * Math.log10(Math.max(res.T, 1e-12));
  const avec = libre - perteMur;
  document.getElementById("dbmFree").textContent = libre.toFixed(0) + " dBm";
  document.getElementById("dbmWall").textContent = avec < -120 ? "< -120 dBm" : avec.toFixed(0) + " dBm";
  document.getElementById("verdict").textContent = qualite(avec);
  document.getElementById("lossInfo").textContent =
    "Le mur fait perdre " + (perteMur > 99 ? "plus de 99" : perteMur.toFixed(1)) + " dB.";
}

/* ---------- BOUCLE D'ANIMATION -------------------------------------- */
let temps = 0, dernier = performance.now();
const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function boucle(now) {
  if (etat.enMarche && !reduit) temps += (now - dernier) / 1000;
  dernier = now;
  dessinerScene(temps);
  requestAnimationFrame(boucle);
}

function actualiser() {
  const res = calcul(etat.f, etat.angle, etat.couches, etat.pol);
  listeCouches();
  afficherResultats(res);
  dessinerCourbes();
  dessinerChamp();
  dessinerScene(temps);
}

/* ---------- 4. COMMANDES -------------------------------------------- */
const $ = id => document.getElementById(id);

// Liste des matériaux
Object.keys(MATERIALS).forEach(cle => {
  const o = document.createElement("option");
  o.value = cle; o.textContent = MATERIALS[cle].nom;
  $("mat").appendChild(o);
});
$("mat").value = cur().mat;

function majTextes() {
  $("freqVal").textContent = etat.f.toFixed(1).replace(".", ",") + " GHz";
  $("angleVal").textContent = etat.angle + "°";
  $("thickVal").textContent = cur().d + " cm";
  $("distVal").textContent = etat.dist + " m";
  const lambda = CLIGHT / (etat.f * 1e9) * 100;
  $("lambdaInfo").textContent = "Longueur d'onde : " + lambda.toFixed(1).replace(".", ",") + " cm";
  document.querySelectorAll("#freqChips button").forEach(b =>
    b.classList.toggle("on", Math.abs(parseFloat(b.dataset.f) - etat.f) < 0.05));
}

$("freq").addEventListener("input", e => { etat.f = parseFloat(e.target.value); majTextes(); actualiser(); });
$("angle").addEventListener("input", e => { etat.angle = parseInt(e.target.value); majTextes(); actualiser(); });
$("thick").addEventListener("input", e => { cur().d = parseFloat(e.target.value); majTextes(); actualiser(); });
$("dist").addEventListener("input", e => { etat.dist = parseInt(e.target.value); majTextes(); actualiser(); });

$("mat").addEventListener("change", e => {
  cur().mat = e.target.value;
  cur().d = MATERIALS[cur().mat].d;        // épaisseur typique du matériau
  $("thick").value = cur().d;
  majTextes(); actualiser();
});

/* Liste des couches : choisir, monter, descendre, dupliquer, supprimer */
function listeCouches() {
  const ul = $("layers"); ul.innerHTML = "";
  etat.couches.forEach((c, i) => {
    const m = MATERIALS[c.mat], li = document.createElement("li");
    li.className = i === etat.sel ? "on" : "";
    li.innerHTML = '<button class="pick" data-a="pick" data-i="' + i + '"><span class="sw" style="background:' + SW[c.mat] + '"></span>' +
      (i + 1) + '. ' + m.nom + ' <em>' + c.d + ' cm</em></button>' +
      '<button data-a="up" data-i="' + i + '" title="Monter">↑</button><button data-a="down" data-i="' + i + '" title="Descendre">↓</button>' +
      '<button data-a="dup" data-i="' + i + '" title="Dupliquer">⧉</button><button data-a="del" data-i="' + i + '" title="Supprimer">✕</button>';
    ul.appendChild(li);
  });
}
function choisir(i) {
  etat.sel = Math.max(0, Math.min(etat.couches.length - 1, i));
  $("mat").value = cur().mat; $("thick").value = cur().d;
  majTextes(); actualiser();
}
$("layers").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const i = parseInt(b.dataset.i), L = etat.couches;
  if (b.dataset.a === "up" && i > 0) { [L[i - 1], L[i]] = [L[i], L[i - 1]]; etat.sel = i - 1; }
  else if (b.dataset.a === "down" && i < L.length - 1) { [L[i + 1], L[i]] = [L[i], L[i + 1]]; etat.sel = i + 1; }
  else if (b.dataset.a === "dup" && L.length < 6) { L.splice(i + 1, 0, { ...L[i] }); etat.sel = i + 1; }
  else if (b.dataset.a === "del" && L.length > 1) { L.splice(i, 1); etat.sel = Math.min(etat.sel, L.length - 1); }
  else if (b.dataset.a === "pick") etat.sel = i;
  choisir(etat.sel);
});
$("addLayer").addEventListener("click", () => {
  if (etat.couches.length >= 6) return;
  etat.couches.push({ mat: "air", d: MATERIALS.air.d }); choisir(etat.couches.length - 1);
});
document.querySelectorAll("#presets button").forEach(b => b.addEventListener("click", () => {
  etat.couches = PRESETS[b.dataset.s].map(c => ({ ...c })); choisir(0);
}));
$("csvBtn").addEventListener("click", () => {
  let csv = "angle_deg,R,T,A\n";
  for (let a = 0; a <= 85; a++) { const r = calcul(etat.f, a, etat.couches, etat.pol); csv += a + "," + r.R.toFixed(4) + "," + r.T.toFixed(4) + "," + r.A.toFixed(4) + "\n"; }
  const l = document.createElement("a");
  l.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); l.download = "reponse-angle.csv"; l.click();
});

document.querySelectorAll("#freqChips button").forEach(b =>
  b.addEventListener("click", () => {
    etat.f = parseFloat(b.dataset.f);
    $("freq").value = etat.f;
    majTextes(); actualiser();
  }));

document.querySelectorAll("#polSeg button").forEach(b =>
  b.addEventListener("click", () => {
    etat.pol = b.dataset.p;
    document.querySelectorAll("#polSeg button").forEach(x => x.classList.toggle("on", x === b));
    actualiser();
  }));

$("playBtn").addEventListener("click", () => {
  etat.enMarche = !etat.enMarche;
  $("playBtn").textContent = etat.enMarche ? "Pause" : "Reprendre";
});

/* Cliquer ou glisser sur la courbe pour changer l'angle */
function poserAngle(e) {
  const r = chart.getBoundingClientRect(), x = (e.clientX - r.left) * chart.width / r.width;
  etat.angle = Math.max(0, Math.min(89, Math.round((x - 52) / (chart.width - 68) * 90)));
  $("angle").value = etat.angle; majTextes(); actualiser();
}
let tireCourbe = false;
chart.addEventListener("pointerdown", e => { tireCourbe = true; chart.setPointerCapture(e.pointerId); poserAngle(e); });
chart.addEventListener("pointermove", e => { if (tireCourbe) poserAngle(e); });
chart.addEventListener("pointerup", () => { tireCourbe = false; });
document.querySelectorAll("#champSeg button").forEach(b => b.addEventListener("click", () => {
  etat.champDb = b.dataset.m === "db";
  document.querySelectorAll("#champSeg button").forEach(x => x.classList.toggle("on", x === b));
  dessinerChamp();
}));
$("csvChamp").addEventListener("click", () => {
  const P = champ._P; let csv = "z_cm,E_normalise\n";
  P.z.forEach((z, i) => { csv += z.toFixed(4) + "," + P.E[i].toFixed(5) + "\n"; });
  const l = document.createElement("a"); l.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); l.download = "profil-champ.csv"; l.click();
});

/* Glisser la poignée pour épaissir ou amincir le mur */
let glisse = false;
function posCanvas(e) {
  const r = scene.getBoundingClientRect();
  return { x: (e.clientX - r.left) * scene.width / r.width, y: (e.clientY - r.top) * scene.height / r.height };
}
function surPoignee(p) {
  const b = geomMur()[etat.sel];
  return Math.abs(p.x - b.x1) < 18 && Math.abs(p.y - 215) < 28;
}
scene.addEventListener("pointerdown", e => {
  if (surPoignee(posCanvas(e))) { glisse = true; scene.setPointerCapture(e.pointerId); }
});
scene.addEventListener("pointermove", e => {
  const p = posCanvas(e);
  if (!glisse) { scene.style.cursor = surPoignee(p) ? "ew-resize" : "default"; return; }
  const b = geomMur()[etat.sel];
  cur().d = Math.max(0.1, Math.min(40, Math.round((p.x - b.x0 - 6) / 90 * 400) / 10));
  $("thick").value = cur().d;
  majTextes(); actualiser();
});
scene.addEventListener("touchstart", e => { if (surPoignee(posCanvas(e.touches[0]))) e.preventDefault(); }, { passive: false });
scene.addEventListener("pointerup", () => { glisse = false; });

$("pngBtn").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = scene.toDataURL("image/png"); a.download = "simulation-wifi.png"; a.click();
});

// Démarrage
majTextes();
actualiser();
requestAnimationFrame(boucle);
