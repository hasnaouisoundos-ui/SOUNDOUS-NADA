/* =====================================================================
   Couverture Wi-Fi d'un bâtiment : plan, murs, meubles, carte en dBm
   Pour chaque point du plan : niveau = Pt - perte en espace libre
   - pertes des murs traversés (même calcul physique que la page "Mur")
   - petites pertes des meubles traversés (tables, comptoir)
   ===================================================================== */
const PX = 50, OX = 20, OY = 520, LARG = 14, HAUT = 10;      // 50 pixels par mètre
const CORR = { y0: 4.5, y1: 6 };                              // le couloir
const PORTES = [[2, 3], [7, 8], [11.5, 12.5]];                // portes dans les murs du couloir
const CLASSES = [
  { min: -55,  c: [67, 160, 71],  nom: "≥ −55 dBm : fort" },
  { min: -67,  c: [253, 216, 53], nom: "−67 à −55 : satisfaisant" },
  { min: -75,  c: [251, 140, 0],  nom: "−75 à −67 : faible" },
  { min: -999, c: [229, 57, 53],  nom: "< −75 : très faible" }
];
const TYPES = { vide: "Vide", classe: "Salle de classe", bureau: "Bureau (ordinateurs)", restaurant: "Restaurant", cafe: "Café" };
const etat = {
  vue: "3d", sol: true, f: 5, pt: 9, mat: "brique", d: 12, w1: 5, w2: 10, hot: { x: 8.3, y: 5.2 }, sel: "salle3",
  types: { salle3: "classe", labo: "classe", info: "classe", salle1: "cafe", salle2: "restaurant", bureau: "bureau", couloir: "vide" }
};
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d");
const hm = document.createElement("canvas"); hm.width = 140; hm.height = 100;
const hc = hm.getContext("2d");
let murs = [], pieces = [], perteTab = [];
const cacheNiv = {};

/* ---------- Géométrie ---------- */
function salles() {
  const { w1, w2 } = etat;
  return [
    { id: "salle3", nom: "Salle 3", x0: 0, x1: w1, y0: 6, y1: 10, ext: "haut" },
    { id: "labo", nom: "Laboratoire", x0: w1, x1: w2, y0: 6, y1: 10, ext: "haut" },
    { id: "info", nom: "Salle info", x0: w2, x1: 14, y0: 6, y1: 10, ext: "haut" },
    { id: "salle1", nom: "Salle 1", x0: 0, x1: w1, y0: 0, y1: 4.5, ext: "bas" },
    { id: "salle2", nom: "Salle 2", x0: w1, x1: w2, y0: 0, y1: 4.5, ext: "bas" },
    { id: "bureau", nom: "Bureau", x0: w2, x1: 14, y0: 0, y1: 4.5, ext: "bas" },
    { id: "couloir", nom: "Couloir", x0: 0, x1: 14, y0: 4.5, y1: 6, ext: null }
  ];
}
function construireMurs() {
  const m = [];
  [CORR.y0, CORR.y1].forEach(y => {
    let x = 0;
    PORTES.forEach(([a, b]) => { m.push({ o: "h", c: y, a: x, b: a }); x = b; });
    m.push({ o: "h", c: y, a: x, b: LARG });
  });
  [etat.w1, etat.w2].forEach(x => { m.push({ o: "v", c: x, a: 0, b: CORR.y0 }); m.push({ o: "v", c: x, a: CORR.y1, b: HAUT }); });
  return m;
}
/* Tables réparties régulièrement dans une salle */
function grille(s, cols, rows, w, h, perte, rond) {
  const out = [], x0 = s.x0 + 0.7, x1 = s.x1 - 0.7, y0 = s.y0 + 0.8, y1 = s.y1 - 0.8;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++)
    out.push({ x: x0 + (i + 0.5) * (x1 - x0) / cols, y: y0 + (j + 0.5) * (y1 - y0) / rows, w, h, perte, rond });
  return out;
}
function meubles(s) {
  const t = etat.types[s.id], W = s.x1 - s.x0, Ht = s.y1 - s.y0, mur = s.ext === "haut" ? s.y1 : s.y0, sens = s.ext === "haut" ? -1 : 1;
  const pcs = [], deco = [];
  if (t === "classe") {
    pcs.push(...grille(s, Math.max(1, Math.floor((W - 1.4) / 1.5)), Math.max(1, Math.floor((Ht - 2.2) / 1.1)), 1.1, 0.55, 1.5, false));
    deco.push({ x: (s.x0 + s.x1) / 2, y: mur + sens * 0.08, w: Math.min(3, W - 1), h: 0.12 });   // le tableau
  } else if (t === "restaurant") {
    pcs.push(...grille(s, Math.max(1, Math.floor((W - 1) / 1.8)), Math.max(1, Math.floor((Ht - 1) / 1.8)), 0.9, 0.9, 1.5, true));
  } else if (t === "bureau") {
    pcs.push(...grille(s, Math.max(1, Math.floor((W - 1) / 1.8)), Math.max(1, Math.floor((Ht - 1.4) / 1.5)), 1.2, 0.7, 2, false));
  } else if (t === "cafe") {
    pcs.push(...grille(s, Math.max(1, Math.floor((W - 1) / 2)), Math.max(1, Math.floor((Ht - 2) / 2.2)), 0.6, 0.6, 1, true));
    pcs.push({ x: (s.x0 + s.x1) / 2, y: mur + sens * 1.1, w: W * 0.6, h: 0.6, perte: 3, rond: false });   // le comptoir
  }
  return { pcs, deco };
}
function recalcGeometrie() { murs = construireMurs(); pieces = salles().flatMap(s => meubles(s).pcs); }
function recalcPertes() {
  perteTab = [];
  for (let a = 0; a < 90; a++) {
    const T = calcul(etat.f, a, [{ mat: etat.mat, d: etat.d }], "AVG").T;
    perteTab.push(Math.min(60, -10 * Math.log10(Math.max(T, 1e-6))));
  }
}

/* ---------- Niveau de signal en un point ---------- */
function traverse(sx, sy, dx, dy, p) {                // le trajet passe-t-il dans le meuble ?
  const hx = p.w / 2, hy = p.h / 2; let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) { if (sx < p.x - hx || sx > p.x + hx) return false; }
  else { let a = (p.x - hx - sx) / dx, b = (p.x + hx - sx) / dx; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return false; }
  if (Math.abs(dy) < 1e-9) { if (sy < p.y - hy || sy > p.y + hy) return false; }
  else { let a = (p.y - hy - sy) / dy, b = (p.y + hy - sy) / dy; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return false; }
  return true;
}
function niveau(x, y) {
  const h = etat.hot, dx = x - h.x, dy = y - h.y, len = Math.hypot(dx, dy) || 1e-9, d = Math.max(1, len);
  let p = etat.pt - (20 * Math.log10(d) + 20 * Math.log10(etat.f * 1000) - 27.55);
  for (const m of murs) {
    let franchi = false;
    if (m.o === "v") { if ((h.x - m.c) * (x - m.c) < 0) { const yy = h.y + (m.c - h.x) / dx * dy; franchi = yy >= m.a && yy <= m.b; } }
    else if ((h.y - m.c) * (y - m.c) < 0) { const xx = h.x + (m.c - h.y) / dy * dx; franchi = xx >= m.a && xx <= m.b; }
    if (franchi) {
      const cos = Math.abs(m.o === "v" ? dx : dy) / len;
      p -= perteTab[Math.min(89, Math.round(Math.acos(Math.min(1, cos)) * 180 / Math.PI))];
    }
  }
  for (const q of pieces) if (traverse(h.x, h.y, dx, dy, q)) p -= q.perte;
  return p;
}
function classe(v) { for (let k = 0; k < 3; k++) if (v >= CLASSES[k].min) return k; return 3; }

/* ---------- Dessin ---------- */
const X = x => OX + x * PX, Y = y => OY - y * PX;
function carte() {
  const img = hc.createImageData(140, 100), compt = [0, 0, 0, 0];
  for (let j = 0; j < 100; j++) for (let i = 0; i < 140; i++) {
    const k = classe(niveau((i + 0.5) * 0.1, (99 - j + 0.5) * 0.1)), c = CLASSES[k].c, o = (j * 140 + i) * 4;
    compt[k]++; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  hc.putImageData(img, 0, 0);
  return compt;
}
function dessiner2D() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(hm, OX, OY - HAUT * PX, LARG * PX, HAUT * PX);

  // meubles
  salles().forEach(s => {
    const m = meubles(s);
    m.pcs.forEach(q => {
      ctx.fillStyle = "#8a5a33"; ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (q.rond) ctx.arc(X(q.x), Y(q.y), q.w / 2 * PX, 0, 7); else ctx.rect(X(q.x - q.w / 2), Y(q.y + q.h / 2), q.w * PX, q.h * PX);
      ctx.fill(); ctx.stroke();
    });
    m.deco.forEach(q => { ctx.fillStyle = "#1f4d3a"; ctx.fillRect(X(q.x - q.w / 2), Y(q.y + q.h / 2), q.w * PX, Math.max(5, q.h * PX)); });
  });

  // murs, portes, contour
  ctx.lineCap = "butt"; ctx.strokeStyle = "#a8452f"; ctx.lineWidth = Math.max(3, Math.min(18, etat.d / 2));
  murs.forEach(m => {
    ctx.beginPath();
    if (m.o === "h") { ctx.moveTo(X(m.a), Y(m.c)); ctx.lineTo(X(m.b), Y(m.c)); } else { ctx.moveTo(X(m.c), Y(m.a)); ctx.lineTo(X(m.c), Y(m.b)); }
    ctx.stroke();
  });
  ctx.strokeStyle = "#d9b26b"; ctx.lineWidth = 4;
  [CORR.y0, CORR.y1].forEach(y => PORTES.forEach(([a, b]) => { ctx.beginPath(); ctx.moveTo(X(a), Y(y)); ctx.lineTo(X(b), Y(y)); ctx.stroke(); }));
  ctx.strokeStyle = "#12232b"; ctx.lineWidth = 6; ctx.strokeRect(OX, OY - HAUT * PX, LARG * PX, HAUT * PX);

  // poignées des murs verticaux
  [etat.w1, etat.w2].forEach(w => [8, 2.25].forEach(y => {
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#2fc0ea"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(X(w) - 8, Y(y) - 17, 16, 34, 8); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(w) - 2, Y(y) - 7); ctx.lineTo(X(w) - 2, Y(y) + 7); ctx.moveTo(X(w) + 2, Y(y) - 7); ctx.lineTo(X(w) + 2, Y(y) + 7); ctx.stroke();
  }));

  // salle choisie + étiquettes
  salles().forEach(s => {
    if (s.id === etat.sel) { ctx.setLineDash([6, 5]); ctx.strokeStyle = "#0b5fd9"; ctx.lineWidth = 2.5; ctx.strokeRect(X(s.x0) + 4, Y(s.y1) + 4, (s.x1 - s.x0) * PX - 8, (s.y1 - s.y0) * PX - 8); ctx.setLineDash([]); }
    const cx = (s.x0 + s.x1) / 2, cy = s.id === "couloir" ? 5.25 : (s.y0 + s.y1) / 2;
    const w = Math.max(70, ctx.measureText(s.nom).width + 16);
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.beginPath(); ctx.roundRect(X(cx) - 42, Y(cy) - 20, 84, 40, 6); ctx.fill();
    ctx.fillStyle = "#12232b"; ctx.textAlign = "center"; ctx.font = "600 13px system-ui, sans-serif";
    ctx.fillText(s.nom, X(cx), Y(cy) - 3); ctx.fillText(Math.round(niveau(cx, cy)) + " dBm", X(cx), Y(cy) + 13);
  });

  // hotspot (étoile)
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 6 : 14, a = -Math.PI / 2 + i * Math.PI / 5; ctx[i ? "lineTo" : "moveTo"](X(etat.hot.x) + r * Math.cos(a), Y(etat.hot.y) + r * Math.sin(a)); }
  ctx.closePath(); ctx.fill(); ctx.stroke();

}

function dessiner() { const compt = carte(); if (etat.vue === "2d") dessiner2D(); afficher(compt); }

/* ---------- Panneau de droite ---------- */
function afficher(compt) {
  salles().forEach(r => { cacheNiv[r.id] = niveau((r.x0 + r.x1) / 2, r.id === "couloir" ? 5.25 : (r.y0 + r.y1) / 2); });
  $("w1").value = etat.w1; $("w2").value = etat.w2;
  $("w1Val").textContent = etat.w1.toFixed(1).replace(".", ",") + " m"; $("w2Val").textContent = etat.w2.toFixed(1).replace(".", ",") + " m";
  const tot = 14000, bien = (compt[0] + compt[1]) / tot * 100;
  $("couv").textContent = bien.toFixed(0) + " %";
  $("leg").innerHTML = CLASSES.map((c, k) =>
    '<li><i style="background:rgb(' + c.c.join(",") + ')"></i><span>' + c.nom + '</span><b>' + (compt[k] / tot * 100).toFixed(0) + ' %</b></li>').join("");
  const s = salles().find(r => r.id === etat.sel);
  $("selNom").textContent = s.nom;
  $("typeSel").value = etat.types[s.id]; $("typeSel").disabled = s.id === "couloir";
  $("selDbm").textContent = Math.round(niveau((s.x0 + s.x1) / 2, s.id === "couloir" ? 5.25 : (s.y0 + s.y1) / 2)) + " dBm";
  $("freqVal").textContent = etat.f.toFixed(1).replace(".", ",") + " GHz";
  $("ptVal").textContent = etat.pt + " dBm";
  $("thickVal").textContent = etat.d + " cm";
  document.querySelectorAll("#chips button").forEach(b => b.classList.toggle("on", Math.abs(parseFloat(b.dataset.f) - etat.f) < 0.05));
}

/* ---------- Souris : déplacer l'étoile et les murs ---------- */
let glisse = null;
function pos(e) { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) * cv.width / r.width - OX) / PX, y: (OY - (e.clientY - r.top) * cv.height / r.height) / PX }; }
function cible(p) {
  if (Math.hypot(p.x - etat.hot.x, p.y - etat.hot.y) < 0.6) return "hot";
  for (const k of ["w1", "w2"]) if (Math.abs(p.x - etat[k]) < 0.25 && (p.y > CORR.y1 || p.y < CORR.y0)) return k;
  return null;
}
cv.addEventListener("pointerdown", e => {
  const p = pos(e); glisse = cible(p);
  if (glisse) cv.setPointerCapture(e.pointerId);
  else { const s = salles().find(r => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1); if (s) { etat.sel = s.id; dessiner(); } }
});
cv.addEventListener("touchstart", e => { if (cible(pos(e.touches[0]))) e.preventDefault(); }, { passive: false });
cv.addEventListener("pointermove", e => {
  const p = pos(e);
  if (!glisse) { const c = cible(p); cv.style.cursor = c === "hot" ? "grab" : c ? "ew-resize" : "default"; return; }
  if (glisse === "hot") { etat.hot.x = Math.max(0.3, Math.min(13.7, p.x)); etat.hot.y = Math.max(0.3, Math.min(9.7, p.y)); }
  else if (glisse === "w1") etat.w1 = Math.round(Math.max(3.2, Math.min(6.8, p.x)) * 10) / 10;
  else etat.w2 = Math.round(Math.max(8.2, Math.min(11.2, p.x)) * 10) / 10;
  recalcGeometrie(); dessiner();
});
cv.addEventListener("pointerup", () => { glisse = null; });

/* ---------- Commandes ---------- */
$("freq").addEventListener("input", e => { etat.f = parseFloat(e.target.value); recalcPertes(); dessiner(); });
document.querySelectorAll("#chips button").forEach(b => b.addEventListener("click", () => { etat.f = parseFloat(b.dataset.f); $("freq").value = etat.f; recalcPertes(); dessiner(); }));
$("pt").addEventListener("input", e => { etat.pt = parseInt(e.target.value); dessiner(); });
["placo", "brique", "beton", "verre", "bois"].forEach(k => { const o = document.createElement("option"); o.value = k; o.textContent = MATERIALS[k].nom; $("mat").appendChild(o); });
$("mat").value = etat.mat;
$("mat").addEventListener("change", e => { etat.mat = e.target.value; etat.d = MATERIALS[etat.mat].d; $("thick").value = etat.d; recalcPertes(); dessiner(); });
$("thick").addEventListener("input", e => { etat.d = parseFloat(e.target.value); recalcPertes(); dessiner(); });
Object.keys(TYPES).forEach(k => { const o = document.createElement("option"); o.value = k; o.textContent = TYPES[k]; $("typeSel").appendChild(o); });
$("typeSel").addEventListener("change", e => { etat.types[etat.sel] = e.target.value; recalcGeometrie(); dessiner(); });

/* =====================================================================
   VUE 3D (projection isométrique) : salles, meubles, personnes animées,
   et ondes Wi-Fi qui se propagent (elles s'affaiblissent derrière les murs)
   ===================================================================== */
const cv3 = $("cv3"), g3 = cv3.getContext("2d");
const V = { yaw: 0.6, S: 34, cx: 450, cy: 350, t: 0 }, ZR = 2.6;     // ZR = hauteur du routeur (au plafond)
const RGB = (c, f, a) => "rgba(" + (c[0] * f | 0) + "," + (c[1] * f | 0) + "," + (c[2] * f | 0) + "," + (a === undefined ? 1 : a) + ")";
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function proj(x, y, z) {                                              // monde (m) -> écran (px)
  const dx = x - 7, dy = y - 5, c = Math.cos(V.yaw), s = Math.sin(V.yaw), xr = dx * c - dy * s, yr = dx * s + dy * c;
  return { x: V.cx + (xr - yr) * 0.866 * V.S, y: V.cy + (xr + yr) * 0.5 * V.S - z * V.S, d: xr + yr };
}
function sol(px, py, z) {                                             // écran -> monde, sur le plan de hauteur z
  const a = (px - V.cx) / (0.866 * V.S), b = (py - V.cy + z * V.S) / (0.5 * V.S), xr = (a + b) / 2, yr = (b - a) / 2, c = Math.cos(V.yaw), s = Math.sin(V.yaw);
  return { x: 7 + xr * c + yr * s, y: 5 - xr * s + yr * c };
}

/* Formes de base : chacune s'ajoute à la liste L, puis on dessine du plus loin au plus proche */
function caja(L, x, y, z, w, d, h, col) {
  const x0 = x - w / 2, x1 = x + w / 2, y0 = y - d / 2, y1 = y + d / 2, z1 = z + h;
  L.push({ k: proj(x, y, z).d + z * 0.02, f: () => {
    const F = [
      [[x0, y0, z], [x1, y0, z], [x1, y0, z1], [x0, y0, z1], 0.74], [[x0, y1, z], [x1, y1, z], [x1, y1, z1], [x0, y1, z1], 0.58],
      [[x0, y0, z], [x0, y1, z], [x0, y1, z1], [x0, y0, z1], 0.66], [[x1, y0, z], [x1, y1, z], [x1, y1, z1], [x1, y0, z1], 0.84],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 1]
    ].map(f => { const p = f.slice(0, 4).map(q => proj(q[0], q[1], q[2])); return { p, k: (p[0].d + p[2].d) / 2, sh: f[4] }; }).sort((a, b) => a.k - b.k);
    g3.strokeStyle = "rgba(0,0,0,0.16)"; g3.lineWidth = 0.7;
    F.forEach(f => { g3.fillStyle = RGB(col, f.sh); g3.beginPath(); f.p.forEach((q, i) => g3[i ? "lineTo" : "moveTo"](q.x, q.y)); g3.closePath(); g3.fill(); g3.stroke(); });
  } });
}
function cil(L, x, y, z, r, h, col) {
  L.push({ k: proj(x, y, z).d + z * 0.02, f: () => {
    const a = proj(x, y, z), b = proj(x, y, z + h), rx = 1.2247 * r * V.S, ry = 0.7071 * r * V.S;
    g3.fillStyle = RGB(col, 0.7); g3.fillRect(a.x - rx, b.y, 2 * rx, a.y - b.y);
    g3.beginPath(); g3.ellipse(a.x, a.y, rx, ry, 0, 0, 7); g3.fill();
    g3.fillStyle = RGB(col, 1); g3.beginPath(); g3.ellipse(b.x, b.y, rx, ry, 0, 0, 7); g3.fill();
  } });
}
function bola(L, x, y, z, r, col) {
  L.push({ k: proj(x, y, z).d + z * 0.02, f: () => {
    const p = proj(x, y, z), R = r * V.S;
    g3.fillStyle = RGB(col, 0.9); g3.beginPath(); g3.arc(p.x, p.y, R, 0, 7); g3.fill();
    g3.fillStyle = "rgba(255,255,255,0.22)"; g3.beginPath(); g3.arc(p.x - R * 0.3, p.y - R * 0.3, R * 0.4, 0, 7); g3.fill();
  } });
}

/* Personnes (assises ou debout), animées avec le temps t */
const PEAU = [[240, 196, 160], [210, 160, 120], [150, 105, 75], [235, 180, 140]];
const CHEM = [[216, 170, 60], [60, 100, 170], [200, 70, 70], [70, 150, 100], [45, 45, 52], [225, 225, 230], [150, 90, 160], [240, 130, 60]];
const CHEV = [[40, 30, 25], [90, 60, 35], [25, 25, 30], [160, 120, 60]];
function personne(L, x, y, face, seed, assis, marche, t) {
  const pa = PEAU[seed % 4], ch = CHEM[seed % 8], cheveux = CHEV[(seed * 3) % 4], pan = [50, 60, 88];
  if (assis) {
    const bob = Math.sin(t * 1.3 + seed) * 0.025, ecrit = Math.sin(t * 5 + seed) * 0.03;
    caja(L, x, y + face * 0.2, 0.44, 0.3, 0.4, 0.12, pan);
    caja(L, x, y + face * 0.38, 0.04, 0.26, 0.12, 0.42, pan);
    caja(L, x, y, 0.55, 0.32, 0.2, 0.46, ch);
    bola(L, x + bob, y + face * 0.03, 1.2, 0.11, pa);
    bola(L, x + bob, y - face * 0.01, 1.26, 0.105, cheveux);
    caja(L, x - 0.19, y + face * (0.25 + ecrit), 0.74, 0.07, 0.34, 0.07, pa);
    caja(L, x + 0.19, y + face * 0.25, 0.74, 0.07, 0.34, 0.07, pa);
    if ((t * 0.4 + seed * 0.37) % 6 < 0.9) caja(L, x + 0.2, y + face * 0.05, 0.95, 0.07, 0.07, 0.42, pa);   // il lève la main
  } else {
    const pas = marche ? Math.sin(t * 6 + seed) * 0.1 : 0, px = marche === "x" ? pas : 0, py = marche === "y" ? pas : 0;
    caja(L, x - 0.09 + px, y + py, 0, 0.14, 0.16, 0.85, pan);
    caja(L, x + 0.09 - px, y - py, 0, 0.14, 0.16, 0.85, pan);
    caja(L, x, y, 0.85, 0.36, 0.22, 0.58, ch);
    bola(L, x, y, 1.56, 0.12, pa); bola(L, x, y, 1.62, 0.11, cheveux);
    caja(L, x - 0.24, y, 0.85, 0.07, 0.1, 0.5, pa); caja(L, x + 0.24, y, 0.85, 0.07, 0.1, 0.5, pa);
  }
}

/* Meubles */
function silla(L, x, y, face) {
  caja(L, x, y, 0.4, 0.4, 0.4, 0.04, [92, 98, 108]); caja(L, x, y - face * 0.19, 0.44, 0.4, 0.04, 0.42, [92, 98, 108]); caja(L, x, y, 0, 0.06, 0.06, 0.4, [70, 75, 85]);
}
function pupitre(L, x, y, w, d) {
  caja(L, x, y, 0.72, w, d, 0.04, [232, 205, 160]);
  caja(L, x - w / 2 + 0.05, y, 0, 0.04, d * 0.85, 0.72, [110, 115, 122]); caja(L, x + w / 2 - 0.05, y, 0, 0.04, d * 0.85, 0.72, [110, 115, 122]);
}
function tableRonde(L, x, y, r) {
  cil(L, x, y, 0, 0.06, 0.74, [90, 70, 50]); cil(L, x, y, 0.74, r, 0.04, [196, 146, 92]);
  cil(L, x + 0.1, y + 0.05, 0.78, Math.min(0.1, r * 0.45), 0.02, [250, 250, 250]); cil(L, x - 0.12, y - 0.06, 0.78, 0.04, 0.07, [235, 235, 235]);
}

/* Une salle selon son type : le mobilier, les gens et leur animation changent */
function meublerSalle(L, s, idx) {
  const t = etat.types[s.id], tt = V.t, W = s.x1 - s.x0, face = s.ext === "haut" ? 1 : -1, mur = s.ext === "haut" ? s.y1 : s.y0, base = idx * 11 + 3, M = meubles(s);
  if (t === "classe" || t === "bureau") {
    M.pcs.forEach((q, i) => {
      pupitre(L, q.x, q.y, q.w, q.h);
      const py = q.y - face * 0.55;
      silla(L, q.x, py, face); personne(L, q.x, py, face, base + i * 3, true, 0, tt);
      if (t === "bureau") caja(L, q.x, q.y + face * 0.12, 0.76, 0.42, 0.04, 0.3, [28, 32, 42]);
      else caja(L, q.x, q.y, 0.76, 0.28, 0.2, 0.012, [250, 250, 250]);
    });
    const D = M.deco[0];
    if (D) {
      caja(L, D.x, D.y, 1.0, D.w, 0.05, 1.1, [248, 248, 250]); caja(L, D.x, D.y, 0.96, D.w + 0.08, 0.06, 0.05, [120, 125, 130]);
      personne(L, s.x0 + W * (0.5 + 0.32 * Math.sin(tt * 0.35)), mur - face * 1.0, face, 77, false, "x", tt);   // le prof marche devant le tableau
    }
  } else if (t === "restaurant" || t === "cafe") {
    M.pcs.filter(q => q.rond).forEach((q, i) => {
      tableRonde(L, q.x, q.y, q.w / 2);
      const e = t === "cafe" ? 0.55 : 0.72;
      [[1, -1], [-1, 1]].forEach(([sg, fc], j) => { const py = q.y + sg * e; silla(L, q.x, py, fc); personne(L, q.x, py, fc, base + i * 3 + j * 5, true, 0, tt); });
    });
    if (t === "restaurant") {                                           // le serveur passe entre les tables avec son plateau
      const wy = face > 0 ? s.y0 + 0.55 : s.y1 - 0.55, wx = s.x0 + 0.9 + (W - 1.8) * (0.5 + 0.5 * Math.sin(tt * 0.5));
      personne(L, wx, wy, 1, 5, false, "x", tt); caja(L, wx + 0.26, wy, 1.25, 0.32, 0.22, 0.03, [205, 208, 214]); cil(L, wx + 0.3, wy, 1.28, 0.05, 0.1, [245, 245, 245]);
    } else {
      const c = M.pcs.find(q => !q.rond);
      if (c) {
        caja(L, c.x, c.y, 0, c.w, c.h, 1.05, [124, 82, 50]); caja(L, c.x, c.y, 1.05, c.w + 0.06, c.h + 0.06, 0.04, [236, 222, 200]);
        caja(L, c.x - c.w * 0.25, c.y, 1.09, 0.4, 0.3, 0.3, [150, 155, 165]);                         // machine à café
        personne(L, c.x + Math.sin(tt * 0.6) * c.w * 0.3, mur - face * 0.45, -face, 9, false, "x", tt); // le barista
      }
    }
  }
}

function murs3D(L) {
  const col = hex(MATERIALS[etat.mat].couleur), ep = Math.max(0.1, etat.d / 100), hh = 1.5, ext = [62, 72, 80];
  const paroi = (x0, y0, x1, y1, e, c) => {                          // mur découpé en petits morceaux (tri correct)
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0))), horiz = Math.abs(y1 - y0) < 1e-6;
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) / n, x = x0 + (x1 - x0) * a, y = y0 + (y1 - y0) * a, l = Math.hypot(x1 - x0, y1 - y0) / n;
      caja(L, x, y, 0, horiz ? l : e, horiz ? e : l, hh, c);
    }
  };
  murs.forEach(m => m.o === "h" ? paroi(m.a, m.c, m.b, m.c, ep, col) : paroi(m.c, m.a, m.c, m.b, ep, col));
  paroi(0, -0.1, 14, -0.1, 0.2, ext); paroi(0, 10.1, 14, 10.1, 0.2, ext); paroi(-0.1, 0, -0.1, 10, 0.2, ext); paroi(14.1, 0, 14.1, 10, 0.2, ext);
}

function routeur3D() {
  const h = etat.hot, a = proj(h.x, h.y, ZR), b = proj(h.x, h.y, 0), pu = 0.5 + 0.5 * Math.sin(V.t * 4);
  g3.setLineDash([3, 4]); g3.strokeStyle = "rgba(18,35,43,.45)"; g3.lineWidth = 1.2; g3.beginPath(); g3.moveTo(a.x, a.y); g3.lineTo(b.x, b.y); g3.stroke(); g3.setLineDash([]);
  g3.fillStyle = "#fff"; g3.strokeStyle = "#000"; g3.lineWidth = 1.5; g3.beginPath();                   // étoile au sol
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 4 : 10, an = -Math.PI / 2 + i * Math.PI / 5; g3[i ? "lineTo" : "moveTo"](b.x + r * Math.cos(an), b.y + 0.6 * r * Math.sin(an)); }
  g3.closePath(); g3.fill(); g3.stroke();
  const gr = g3.createRadialGradient(a.x, a.y, 2, a.x, a.y, 44);
  gr.addColorStop(0, "rgba(47,192,234," + (0.45 + 0.2 * pu) + ")"); gr.addColorStop(1, "rgba(47,192,234,0)");
  g3.fillStyle = gr; g3.beginPath(); g3.arc(a.x, a.y, 44, 0, 7); g3.fill();
  const L2 = []; caja(L2, h.x, h.y, ZR, 0.4, 0.28, 0.07, [235, 238, 242]);
  caja(L2, h.x - 0.14, h.y, ZR + 0.07, 0.03, 0.03, 0.3, [40, 45, 55]); caja(L2, h.x + 0.14, h.y, ZR + 0.07, 0.03, 0.03, 0.3, [40, 45, 55]);
  L2.forEach(o => o.f());
}

/* Ondes : des coques sphériques qui grandissent depuis le routeur. Leur intensité vient du calcul (murs, distance) */
function ondes3D() {
  const RM = 17, K = 4, hz = [0.1, 0.8, 1.5, 2.2, 2.6], h = etat.hot, B = [[], [], [], []];
  for (let k = 0; k < K; k++) {
    const r = (V.t * 2.6 + k * RM / K) % RM, fade = 1 - r / RM;
    hz.forEach(zz => {
      const dz = ZR - zz;
      if (r <= dz + 0.05) return;
      const rho = Math.sqrt(r * r - dz * dz); let prev = null;
      for (let i = 0; i <= 90; i++) {
        const a = i / 90 * 2 * Math.PI, x = h.x + rho * Math.cos(a), y = h.y + rho * Math.sin(a);
        if (x < 0 || x > 14 || y < 0 || y > 10) { prev = null; continue; }
        const q = proj(x, y, zz);
        if (prev) {
          const st = Math.max(0, Math.min(1, (niveau(x, y) + 85) / 45)) * fade;
          if (st > 0.04) B[Math.min(3, Math.floor(st * 4.2))].push(prev.x, prev.y, q.x, q.y);
        }
        prev = q;
      }
    });
  }
  g3.lineCap = "round";
  B.forEach((seg, b) => {
    g3.strokeStyle = "rgba(14,140,205," + (0.2 + b * 0.2) + ")"; g3.lineWidth = 1.2 + b * 0.8; g3.beginPath();
    for (let i = 0; i < seg.length; i += 4) { g3.moveTo(seg[i], seg[i + 1]); g3.lineTo(seg[i + 2], seg[i + 3]); }
    g3.stroke();
  });
}

function etiquettes3D() {
  g3.font = "600 12px system-ui, sans-serif"; g3.textAlign = "left";
  salles().forEach(s => {
    const v = cacheNiv[s.id]; if (v === undefined) return;
    const p = proj((s.x0 + s.x1) / 2, s.id === "couloir" ? 5.25 : (s.y0 + s.y1) / 2, 2.3), txt = s.nom + " · " + Math.round(v) + " dBm", w = g3.measureText(txt).width + 30;
    g3.save(); g3.shadowColor = "rgba(18,35,43,.2)"; g3.shadowBlur = 8; g3.shadowOffsetY = 3;
    g3.fillStyle = "rgba(255,255,255,0.93)"; g3.beginPath(); g3.roundRect(p.x - w / 2, p.y - 12, w, 24, 12); g3.fill(); g3.restore();
    g3.fillStyle = "rgb(" + CLASSES[classe(v)].c.join(",") + ")"; g3.beginPath(); g3.arc(p.x - w / 2 + 13, p.y, 5, 0, 7); g3.fill();
    g3.fillStyle = "#12232b"; g3.fillText(txt, p.x - w / 2 + 24, p.y + 4);
  });
}

const SOLS = { classe: [232, 232, 228], bureau: [212, 222, 234], restaurant: [216, 198, 178], cafe: [204, 164, 114], vide: [236, 239, 241] };
function dessiner3D() {
  g3.clearRect(0, 0, cv3.width, cv3.height);
  const sl = salles();
  sl.forEach(s => {                                                   // sol de chaque salle
    g3.fillStyle = RGB(s.id === "couloir" ? [226, 230, 233] : SOLS[etat.types[s.id]], 1); g3.beginPath();
    [[s.x0, s.y0], [s.x1, s.y0], [s.x1, s.y1], [s.x0, s.y1]].forEach((q, i) => { const p = proj(q[0], q[1], 0); g3[i ? "lineTo" : "moveTo"](p.x, p.y); });
    g3.closePath(); g3.fill();
  });
  if (etat.sol) {                                                     // carte de couverture plaquée au sol
    const o = proj(0, 0, 0), ex = proj(1, 0, 0), ey = proj(0, 1, 0), ax = ex.x - o.x, ay = ex.y - o.y, bx = ey.x - o.x, by = ey.y - o.y;
    g3.save(); g3.globalAlpha = 0.5; g3.imageSmoothingEnabled = false;
    g3.setTransform(ax * 0.1, ay * 0.1, -bx * 0.1, -by * 0.1, o.x + bx * 10, o.y + by * 10); g3.drawImage(hm, 0, 0); g3.restore();
  }
  const sel = sl.find(r => r.id === etat.sel);                        // contour de la salle choisie
  g3.setLineDash([7, 5]); g3.strokeStyle = "#0b5fd9"; g3.lineWidth = 2.5; g3.beginPath();
  [[sel.x0, sel.y0], [sel.x1, sel.y0], [sel.x1, sel.y1], [sel.x0, sel.y1]].forEach((q, i) => { const p = proj(q[0], q[1], 0.02); g3[i ? "lineTo" : "moveTo"](p.x, p.y); });
  g3.closePath(); g3.stroke(); g3.setLineDash([]);

  const L = [];
  murs3D(L); sl.forEach((s, i) => { if (s.id !== "couloir") meublerSalle(L, s, i); });
  [0, 1, 2].forEach(k => {                                            // des gens marchent dans le couloir
    const ph = V.t * 0.22 + k * 2.1, x = 1.2 + 11.6 * (0.5 + 0.5 * Math.sin(ph));
    personne(L, x, 4.85 + k * 0.22, Math.cos(ph) >= 0 ? 1 : -1, 30 + k * 7, false, "x", V.t);
  });
  L.sort((a, b) => a.k - b.k).forEach(o => o.f());
  routeur3D(); ondes3D(); etiquettes3D();
}

/* Souris / doigt : tourner la vue, déplacer le routeur, choisir une salle */
let mode3 = null, dep3 = null, zg3 = 0, bouge3 = 0;
function pos3(e) { const r = cv3.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv3.width / r.width, y: (e.clientY - r.top) * cv3.height / r.height }; }
function cible3(p) {
  const a = proj(etat.hot.x, etat.hot.y, ZR), b = proj(etat.hot.x, etat.hot.y, 0);
  if (Math.hypot(p.x - a.x, p.y - a.y) < 30) return ZR;
  return Math.hypot(p.x - b.x, p.y - b.y) < 22 ? 0 : null;
}
cv3.addEventListener("touchstart", e => { if (cible3(pos3(e.touches[0])) !== null) e.preventDefault(); }, { passive: false });
cv3.addEventListener("pointerdown", e => {
  const p = pos3(e), z = cible3(p);
  mode3 = z === null ? "rot" : "hot"; zg3 = z || 0; dep3 = p; bouge3 = 0; cv3.setPointerCapture(e.pointerId);
});
cv3.addEventListener("pointermove", e => {
  const p = pos3(e);
  if (!mode3) { cv3.style.cursor = cible3(p) !== null ? "grab" : "default"; return; }
  bouge3 += Math.abs(p.x - dep3.x) + Math.abs(p.y - dep3.y);
  if (mode3 === "rot") V.yaw += (p.x - dep3.x) * 0.008;
  else { const q = sol(p.x, p.y, zg3); etat.hot.x = Math.max(0.3, Math.min(13.7, q.x)); etat.hot.y = Math.max(0.3, Math.min(9.7, q.y)); dessiner(); }
  dep3 = p;
});
cv3.addEventListener("pointerup", e => {
  if (mode3 === "rot" && bouge3 < 6) {
    const q = sol(pos3(e).x, pos3(e).y, 0), s = salles().find(r => q.x >= r.x0 && q.x <= r.x1 && q.y >= r.y0 && q.y <= r.y1);
    if (s) { etat.sel = s.id; dessiner(); }
  }
  mode3 = null;
});

/* Boutons : vue 3D / plan 2D, couverture au sol, position des murs */
document.querySelectorAll("#vueSeg button").forEach(b => b.addEventListener("click", () => {
  etat.vue = b.dataset.v;
  document.querySelectorAll("#vueSeg button").forEach(x => x.classList.toggle("on", x === b));
  $("cv3").hidden = etat.vue !== "3d"; $("cv").hidden = etat.vue !== "2d";
  $("aide3").textContent = etat.vue === "3d" ? "Glisse la vue pour la tourner. Glisse le routeur pour le déplacer. Clique sur une salle pour la choisir." : "Glisse l'étoile pour déplacer le routeur. Glisse les poignées blanches pour agrandir ou réduire les salles.";
  dessiner();
}));
$("sol").addEventListener("change", e => { etat.sol = e.target.checked; });
$("w1").addEventListener("input", e => { etat.w1 = parseFloat(e.target.value); recalcGeometrie(); dessiner(); });
$("w2").addEventListener("input", e => { etat.w2 = parseFloat(e.target.value); recalcGeometrie(); dessiner(); });

let dernier3 = performance.now();
const calme = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function boucle3(now) {
  if (!calme) V.t += Math.min(0.05, (now - dernier3) / 1000);
  dernier3 = now;
  if (etat.vue === "3d" && cv3.offsetParent !== null) dessiner3D();
  requestAnimationFrame(boucle3);
}

recalcGeometrie(); recalcPertes(); dessiner();
requestAnimationFrame(boucle3);
