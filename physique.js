/* Physique commune : matériaux, matrices de transfert (murs multicouches), niveau de signal */
/* ---------- 1. MATÉRIAUX (UIT-R P.2040) ----------------------------
   eps  : permittivité relative
   a, b : conductivité sigma = a * f^b  (f en GHz, sigma en S/m)
   d    : épaisseur par défaut en cm                                   */
const MATERIALS = {
  placo:  { nom: "Plaque de plâtre", eps: 2.94, a: 0.0116, b: 0.7076, d: 1.3,  couleur: "#d9d4c7" },
  bois:   { nom: "Bois",             eps: 1.99, a: 0.0047, b: 1.0718, d: 4,    couleur: "#c9a27a" },
  brique: { nom: "Brique",           eps: 3.75, a: 0.038,  b: 0,      d: 12,   couleur: "#b5482f" },
  beton:  { nom: "Béton",            eps: 5.31, a: 0.0326, b: 0.8095, d: 20,   couleur: "#a9afb2" },
  verre:  { nom: "Verre",            eps: 6.27, a: 0.0043, b: 1.1925, d: 0.6,  couleur: "#b9dfe6" },
  air:    { nom: "Lame d'air",       eps: 1,    a: 0,      b: 0,      d: 2,    couleur: "#dff1f8" },
  metal:  { nom: "Métal",            eps: 1,    a: 1e7,    b: 0,      d: 0.2,  couleur: "#7d8a92" }
};

/* ---------- 2. PHYSIQUE ---------------------------------------------
   Petite "boîte à outils" pour les nombres complexes : {re, im}      */
const C = {
  add: (x, y) => ({ re: x.re + y.re, im: x.im + y.im }),
  sub: (x, y) => ({ re: x.re - y.re, im: x.im - y.im }),
  mul: (x, y) => ({ re: x.re * y.re - x.im * y.im, im: x.re * y.im + x.im * y.re }),
  div: (x, y) => {
    const den = y.re * y.re + y.im * y.im;
    return { re: (x.re * y.re + x.im * y.im) / den, im: (x.im * y.re - x.re * y.im) / den };
  },
  abs2: x => x.re * x.re + x.im * x.im,
  sqrt: x => {
    const r = Math.hypot(x.re, x.im);
    const re = Math.sqrt((r + x.re) / 2);
    const im = Math.sqrt(Math.max(0, (r - x.re) / 2));
    return { re, im: x.im < 0 ? -im : im };
  },
  exp: x => ({ re: Math.exp(x.re) * Math.cos(x.im), im: Math.exp(x.re) * Math.sin(x.im) }),
  real: x => ({ re: x, im: 0 })
};

const EPS0 = 8.854e-12;   // permittivité du vide (F/m)
const CLIGHT = 3e8;       // vitesse de la lumière (m/s)

/* Mur = liste de couches [{mat, d(cm)}], de l'émetteur vers le récepteur.
   Méthode des matrices de transfert : on multiplie une matrice 2x2 par couche. */
function mur(fGHz, angleDeg, couches, pol) {
  const f = fGHz * 1e9, omega = 2 * Math.PI * f, k0 = 2 * Math.PI * f / CLIGHT;
  const th = angleDeg * Math.PI / 180, s = C.real(Math.sin(th));
  const p0 = C.real(Math.cos(th));                       // air : p = cos(theta)
  let m11 = C.real(1), m12 = C.real(0), m21 = C.real(0), m22 = C.real(1);

  couches.forEach(c => {
    const mat = MATERIALS[c.mat];
    const sigma = mat.a * Math.pow(fGHz, mat.b);
    const n = C.sqrt({ re: mat.eps, im: sigma / (omega * EPS0) });
    const sinT = C.div(s, n);
    const cosT = C.sqrt(C.sub(C.real(1), C.mul(sinT, sinT)));
    const p = pol === "TE" ? C.mul(n, cosT) : C.div(cosT, n);
    const delta = C.mul(C.real(k0 * c.d / 100), C.mul(n, cosT));
    const ch = Math.cosh(Math.min(delta.im, 100)), sh = Math.sinh(Math.min(delta.im, 100));
    const cd = { re: Math.cos(delta.re) * ch, im: -Math.sin(delta.re) * sh };   // cos(delta)
    const sd = { re: Math.sin(delta.re) * ch, im: Math.cos(delta.re) * sh };    // sin(delta)
    const mi = { re: 0, im: -1 };
    const a12 = C.mul(mi, C.div(sd, p)), a21 = C.mul(mi, C.mul(p, sd));
    const n11 = C.add(C.mul(m11, cd), C.mul(m12, a21)), n12 = C.add(C.mul(m11, a12), C.mul(m12, cd));
    const n21 = C.add(C.mul(m21, cd), C.mul(m22, a21)), n22 = C.add(C.mul(m21, a12), C.mul(m22, cd));
    m11 = n11; m12 = n12; m21 = n21; m22 = n22;
  });

  const u = C.add(m11, C.mul(m12, p0)), v = C.add(m21, C.mul(m22, p0));
  const up = C.mul(u, p0);
  const den = C.add(up, v);
  const r = C.div(C.sub(up, v), den);
  const t = C.div(C.mul(C.real(2), p0), den);
  const R = Math.min(1, C.abs2(r));
  const T = Math.min(1 - R, C.abs2(t));
  return { R, T, A: Math.max(0, 1 - R - T) };
}

/* Applique la polarisation choisie (TE, TM ou moyenne des deux) */
function calcul(fGHz, angleDeg, couches, pol) {
  if (pol === "AVG") {
    const a = mur(fGHz, angleDeg, couches, "TE"), b = mur(fGHz, angleDeg, couches, "TM");
    return { R: (a.R + b.R) / 2, T: (a.T + b.T) / 2, A: (a.A + b.A) / 2 };
  }
  return mur(fGHz, angleDeg, couches, pol);
}

/* Niveau reçu en dBm : puissance émise - perte en espace libre + effet du mur */
const PTX_DBM = 20;
function niveauSansMur(fGHz, dist) {
  const fsplDb = 20 * Math.log10(dist) + 20 * Math.log10(fGHz * 1000) - 27.55;
  return PTX_DBM - fsplDb;
}


/* ---------- Profil du champ |E(z)| à travers le mur ---------- */
if (typeof CanvasRenderingContext2D !== "undefined" && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };   // vieux navigateurs
}
function cosSinC(dl) {
  const b = Math.min(dl.im, 100), ch = Math.cosh(b), sh = Math.sinh(b);
  return { cd: { re: Math.cos(dl.re) * ch, im: -Math.sin(dl.re) * sh }, sd: { re: Math.sin(dl.re) * ch, im: Math.cos(dl.re) * sh } };
}
/* Champ tangentiel normalisé à l'onde incidente. z en cm : le mur commence en z = 0.
   On part de la sortie du mur et on remonte vers l'entrée avec la matrice de chaque couche. */
function profilChamp(fGHz, angleDeg, couches, pol, zA) {
  const f = fGHz * 1e9, omega = 2 * Math.PI * f, k0 = 2 * Math.PI * f / CLIGHT;
  const th = angleDeg * Math.PI / 180, s = C.real(Math.sin(th)), cos0 = Math.cos(th), mi = { re: 0, im: -1 };
  const infos = couches.map(c => {
    const m = MATERIALS[c.mat], sigma = m.a * Math.pow(fGHz, m.b);
    const n = C.sqrt({ re: m.eps, im: sigma / (omega * EPS0) });
    const sn = C.div(s, n), cosT = C.sqrt(C.sub(C.real(1), C.mul(sn, sn)));
    return { p: pol === "TE" ? C.mul(n, cosT) : C.div(cosT, n), kz: C.mul(C.real(k0 / 100), C.mul(n, cosT)), d: c.d };
  });
  const D = couches.reduce((t, c) => t + c.d, 0);
  let U = C.real(1), V = C.real(cos0), zFin = D;
  const zs = [], Es = [];
  for (let j = infos.length - 1; j >= 0; j--) {
    const { p, kz, d } = infos[j], nq = Math.max(8, Math.ceil(60 * d / D));
    const pas = q => {
      const { cd, sd } = cosSinC(C.mul(C.real(q), kz));
      return { U: C.add(C.mul(cd, U), C.mul(C.mul(mi, C.div(sd, p)), V)), V: C.add(C.mul(C.mul(mi, C.mul(p, sd)), U), C.mul(cd, V)) };
    };
    for (let i = 0; i <= nq; i++) { const r = pas(d * i / nq); zs.push(zFin - d * i / nq); Es.push(Math.sqrt(C.abs2(r.U))); }
    const fin = pas(d); U = fin.U; V = fin.V; zFin -= d;
  }
  const Vp = C.div(V, C.real(cos0)), a = C.div(C.add(U, Vp), C.real(2)), b = C.div(C.sub(U, Vp), C.real(2));
  const na = Math.sqrt(C.abs2(a)) || 1e-9, r = C.div(b, a);
  const z = [], E = [], kzA = k0 / 100 * cos0, N = 80;
  for (let i = 0; i < N; i++) {                                   // air avant le mur : onde incidente + réfléchie
    const zz = zA * (1 - i / N), e1 = { re: Math.cos(kzA * zz), im: Math.sin(kzA * zz) }, e2 = { re: e1.re, im: -e1.im };
    z.push(zz); E.push(Math.sqrt(C.abs2(C.add(e1, C.mul(r, e2)))));
  }
  for (let i = zs.length - 1; i >= 0; i--) { z.push(zs[i]); E.push(Es[i] / na); }
  return { z, E, D, T: 1 / na };
}
