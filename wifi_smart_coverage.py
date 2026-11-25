#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Wi-Fi Smart Coverage - simulation et optimisation de la couverture Wi-Fi
Mini-projet GSR1 : propagation des ondes EM dans les milieux materiels.

Lancement :  python wifi_smart_coverage.py
Dependances : numpy, matplotlib (tkinter fourni avec Python)
"""
import tkinter as tk
from tkinter import ttk, messagebox
import numpy as np
import matplotlib
matplotlib.use("TkAgg")
from matplotlib.figure import Figure
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.colors import ListedColormap, BoundaryNorm
from matplotlib.patches import Polygon, Patch
from matplotlib.lines import Line2D

C0 = 299792458.0

# --------------------------------------------------------------------------
# 1. MODELE PHYSIQUE
# --------------------------------------------------------------------------
# Proprietes dielectriques : ITU-R P.2040-1, eps' = a f^b ; sigma = c f^d (f en GHz)
MATERIALS = {
    "Béton":        (5.31, 0.0, 0.0326, 0.8095),
    "Brique":       (3.75, 0.0, 0.0380, 0.0),
    "Plâtre":       (2.94, 0.0, 0.0116, 0.7076),
    "Verre":        (6.27, 0.0, 0.0043, 1.1925),
    "Bois (porte)": (1.99, 0.0, 0.0047, 1.0718),
}
WALL_MATS = ["Béton", "Brique", "Plâtre", "Verre"]
MAT_COLOR = {"Béton": "#555555", "Brique": "#a0452c", "Plâtre": "#cfcfcf", "Verre": "#35b8d8"}
OPEN_KINDS = ["Porte (bois 4 cm)", "Ouverture libre", "Fenêtre (verre 1 cm)"]


def complex_eps(mat, f_ghz):
    a, b, c, d = MATERIALS[mat]
    ep = a * f_ghz ** b
    sigma = c * f_ghz ** d
    epp = 17.98 * sigma / f_ghz          # eps'' = sigma / (eps0 * omega)
    return ep + 1j * epp


def slab_loss_db(mat, thick_m, f_ghz, cos_i):
    """Perte de transmission (dB) d'une lame a faces paralleles, incidence oblique.
    Matrice de transfert (Fabry-Perot, reflexions internes incluses), moyenne TE/TM."""
    cos_i = np.clip(np.asarray(cos_i, float), 0.05, 1.0)
    eps = complex_eps(mat, f_ghz)
    n2 = np.sqrt(eps)                                    # indice complexe (Im>0 : pertes)
    sin2 = 1.0 - cos_i ** 2
    cos_t = np.sqrt(1.0 - sin2 / eps)                    # loi de Snell-Descartes
    k0 = 2 * np.pi * f_ghz * 1e9 / C0
    delta = k0 * thick_m * n2 * cos_t                    # dephasage complexe dans la lame
    cd, sd = np.cos(delta), np.sin(delta)
    T = 0.0
    for pol in ("TE", "TM"):
        if pol == "TE":
            e1, e2 = cos_i, n2 * cos_t
        else:
            e1, e2 = 1.0 / cos_i, n2 / cos_t
        B = cd - 1j * sd * e1 / e2
        C = -1j * e2 * sd + cd * e1
        t = 2 * e1 / (e1 * B + C)
        T = T + np.abs(t) ** 2
    T = np.clip(T / 2, 1e-12, 1.0)
    return -10 * np.log10(T)


CS = np.linspace(0.05, 1.0, 96)    # table des cos(theta_incidence)


def build_tables(walls, f, portes_ouvertes):
    door_tabs = {
        OPEN_KINDS[0]: np.zeros_like(CS) if portes_ouvertes else slab_loss_db("Bois (porte)", 0.04, f, CS),
        OPEN_KINDS[1]: np.zeros_like(CS),
        OPEN_KINDS[2]: slab_loss_db("Verre", 0.01, f, CS),
    }
    tabs = [slab_loss_db(w["mat"], w["t"] / 100.0, f, CS) for w in walls]
    return tabs, door_tabs


def rx_map(P, gx, gy, walls, tabs, door_tabs, pt_dbm, f, nexp):
    """Puissance recue (dBm) : Pt - PL(d) - somme des pertes de murs traverses (trajet direct)."""
    dx, dy = gx - P[0], gy - P[1]
    dist = np.hypot(dx, dy)
    d = np.maximum(dist, 0.5)
    pl1m = 20 * np.log10(4 * np.pi * f * 1e9 / C0)       # espace libre a 1 m
    loss = np.zeros_like(d)
    for w, tab in zip(walls, tabs):
        A = np.array(w["p1"], float)
        s = np.array(w["p2"], float) - A
        L = np.hypot(*s)
        if L < 1e-9:
            continue
        den = dx * s[1] - dy * s[0]
        ax, ay = A[0] - P[0], A[1] - P[1]
        ok = np.abs(den) > 1e-12
        den_safe = np.where(ok, den, 1.0)
        t = (ax * s[1] - ay * s[0]) / den_safe
        u = (ax * dy - ay * dx) / den_safe
        hit = ok & (t > 0) & (t < 1) & (u >= 0) & (u <= 1)
        if not hit.any():
            continue
        n = np.array([-s[1], s[0]]) / L
        cosi = np.abs(dx * n[0] + dy * n[1]) / np.maximum(dist, 1e-9)   # angle d'incidence
        wl = np.interp(cosi, CS, tab)
        pos = u * L
        for c, wd, kind in w["doors"]:
            m = np.abs(pos - c) <= wd / 2
            wl = np.where(m, np.interp(cosi, CS, door_tabs[kind]), wl)
        loss += np.where(hit, wl, 0.0)
    return pt_dbm - pl1m - 10 * nexp * np.log10(d) - loss


def dist_to_walls(P, walls):
    best = 1e9
    for w in walls:
        A, B = np.array(w["p1"], float), np.array(w["p2"], float)
        s = B - A
        L2 = max(s @ s, 1e-12)
        tt = np.clip(((np.array(P) - A) @ s) / L2, 0, 1)
        best = min(best, np.hypot(*(np.array(P) - (A + tt * s))))
    return best


# --------------------------------------------------------------------------
# 2. PLAN PAR DEFAUT : etage 14 m x 10 m, 7 pieces
# --------------------------------------------------------------------------
W_B, H_B = 14.0, 10.0
ROOMS = [("Salle 1", 0, 0, 5, 4.5), ("Salle 2", 5, 0, 10, 4.5), ("Bureau", 10, 0, 14, 4.5),
         ("Couloir", 0, 4.5, 14, 6), ("Salle 3", 0, 6, 5, 10),
         ("Laboratoire", 5, 6, 10, 10), ("Salle info", 10, 6, 14, 10)]
EXT = [((0, 0), (W_B, 0)), ((W_B, 0), (W_B, H_B)), ((W_B, H_B), (0, H_B)), ((0, H_B), (0, 0))]


def default_walls():
    P, O = OPEN_KINDS[0], OPEN_KINDS[1]
    return [
        dict(name="Cloison couloir Sud", p1=(0, 4.5), p2=(14, 4.5), mat="Brique", t=15,
             doors=[(2.5, 0.9, P), (7.5, 0.9, P), (12.0, 0.9, P)]),
        dict(name="Cloison couloir Nord", p1=(0, 6), p2=(14, 6), mat="Brique", t=15,
             doors=[(2.5, 0.9, P), (7.5, 0.9, P), (12.0, 0.9, O)]),
        dict(name="Mur Salle1/Salle2", p1=(5, 0), p2=(5, 4.5), mat="Plâtre", t=10, doors=[]),
        dict(name="Mur Salle2/Bureau", p1=(10, 0), p2=(10, 4.5), mat="Béton", t=20, doors=[]),
        dict(name="Mur Salle3/Labo", p1=(5, 6), p2=(5, 10), mat="Plâtre", t=10, doors=[]),
        dict(name="Mur Labo/Salle info", p1=(10, 6), p2=(10, 10), mat="Verre", t=8, doors=[]),
    ]


# --------------------------------------------------------------------------
# 3. APPLICATION
# --------------------------------------------------------------------------
LEVELS = [-75, -67, -55]
CMAP = ListedColormap(["#e53935", "#fb8c00", "#fdd835", "#43a047"])
NORM = BoundaryNorm([-300] + LEVELS + [100], CMAP.N)
STEP = 0.1
GXs = np.arange(STEP / 2, W_B, STEP)
GYs = np.arange(STEP / 2, H_B, STEP)
GX, GY = np.meshgrid(GXs, GYs)
ROOM_IDX = -np.ones(GX.shape, int)
for _i, (_n, x0, y0, x1, y1) in enumerate(ROOMS):
    ROOM_IDX[(GX >= x0) & (GX < x1) & (GY >= y0) & (GY < y1)] = _i

HELP = """HYPOTHÈSES PHYSIQUES
• Trajet direct 2D : le rayon émetteur → point est tracé, et chaque mur qu'il traverse ajoute une perte.
• Perte en espace libre (Friis) à 1 m : 20·log10(4πf/c), puis 10·n·log10(d). n = 3,3 par défaut (valeur typique en intérieur cloisonné ; réglable de 1,6 à 3,5 ; n = 2 : espace libre).
• Matériaux : permittivité complexe ε = ε' − jε'' selon ITU-R P.2040-1 (ε' et σ dépendent de f). Béton, brique, plâtre, verre, bois (portes).
• Traversée d'un mur : lame diélectrique à pertes d'épaisseur e, en incidence oblique (angle entre le rayon et la normale du mur). Calcul par matrice de transfert avec réflexions internes (Fabry-Perot), moyenne des polarisations TE et TM.
  La perte dépend donc de la fréquence (via ε, σ, et k0·e), de l'épaisseur, du matériau et de l'angle d'incidence (trajet plus long en biais).
• Portes : bois 4 cm (ou ouvertes = 0 dB), ouvertures libres, fenêtres (verre 1 cm), placées le long d'un mur (position en m depuis le point 1).
• Seuils de couleur : ≥ −55 vert, −67 à −55 jaune, −75 à −67 orange, < −75 rouge (indicatifs, sans lien direct avec le débit).
• Optimisation : balayage de positions candidates (pas 0,5 m) puis raffinement (pas 0,1 m) ; critère = % de surface ≥ seuil.

LIMITES
• Pas de réflexions multiples ni de diffraction : zones d'ombre souvent pessimistes (coins, couloirs).
• Pas d'évanouissements (multi-trajets), de mobilier, d'étages, ni d'antenne directive (gain isotrope).
• Murs supposés homogènes, infinis et à faces parallèles ; épaisseurs et permittivités indicatives.
• Les pièces (statistiques) sont fixes ; si vous déplacez un mur, les pourcentages par pièce restent calculés sur les rectangles d'origine.
• Les murs extérieurs sont dessinés mais n'interviennent pas (le hotspot est à l'intérieur).
"""


class App:
    def __init__(self, root):
        self.root = root
        root.title("Wi-Fi Smart Coverage – couverture Wi-Fi d'un bâtiment")
        root.geometry("1540x880")
        self.walls = default_walls()
        self.loading = False
        self.job = None
        self.dragging = False
        self.opt = None          # dict(before, after, pos) tant que valide
        self.x = tk.DoubleVar(value=2.5)
        self.y = tk.DoubleVar(value=2.2)
        self.f = tk.DoubleVar(value=2.4)
        self.pw = tk.DoubleVar(value=15.0)
        self.thr = tk.DoubleVar(value=-70.0)
        self.nexp = tk.DoubleVar(value=3.3)
        self.open_doors = tk.BooleanVar(value=False)
        self.mat = tk.StringVar(value="Brique")
        self.thick = tk.DoubleVar(value=15)
        self.ent = [tk.StringVar() for _ in range(4)]
        self.door_pos = tk.StringVar(value="2.5")
        self.door_kind = tk.StringVar(value=OPEN_KINDS[0])
        self.build_ui()
        self.refresh_list(0)
        self.update_map()

    # ---------------- interface ----------------
    def build_ui(self):
        left = ttk.Frame(self.root, width=360)
        left.pack(side="left", fill="y")
        right = ttk.Frame(self.root, width=380)
        right.pack(side="right", fill="y")
        center = ttk.Frame(self.root)
        center.pack(side="left", fill="both", expand=True)

        # ---- zone gauche (defilante)
        cv = tk.Canvas(left, highlightthickness=0, width=345)
        sb = ttk.Scrollbar(left, orient="vertical", command=cv.yview)
        inner = ttk.Frame(cv)
        inner.bind("<Configure>", lambda e: cv.configure(scrollregion=cv.bbox("all")))
        cv.create_window((0, 0), window=inner, anchor="nw")
        cv.configure(yscrollcommand=sb.set)
        cv.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")
        cv.bind_all("<MouseWheel>", lambda e: cv.yview_scroll(int(-e.delta / 120), "units"))
        cv.bind_all("<Button-4>", lambda e: cv.yview_scroll(-1, "units"))
        cv.bind_all("<Button-5>", lambda e: cv.yview_scroll(1, "units"))

        g = ttk.LabelFrame(inner, text="Hotspot et signal")
        g.pack(fill="x", padx=6, pady=4)
        self.slider(g, "Position X (m)", self.x, 0, W_B, 0.05, self.on_hotspot)
        self.slider(g, "Position Y (m)", self.y, 0, H_B, 0.05, self.on_hotspot)
        fr = ttk.Frame(g)
        fr.pack(fill="x", padx=4)
        ttk.Label(fr, text="Bande Wi-Fi :").pack(side="left")
        ttk.Button(fr, text="2,4 GHz", command=lambda: self.set_band(2.4)).pack(side="left", padx=4)
        ttk.Button(fr, text="5 GHz", command=lambda: self.set_band(5.0)).pack(side="left")
        self.slider(g, "Fréquence libre (GHz) – exploration 2 à 6", self.f, 2.0, 6.0, 0.05, self.on_struct)
        self.slider(g, "Puissance d'émission (dBm)", self.pw, 0, 30, 0.5, self.on_struct)
        self.slider(g, "Seuil de couverture (dBm)", self.thr, -90, -50, 1, self.on_hotspot)
        self.slider(g, "Exposant de perte n (espace libre = 2)", self.nexp, 1.6, 3.5, 0.1, self.on_struct)
        ttk.Checkbutton(g, text="Portes ouvertes (0 dB)", variable=self.open_doors,
                        command=self.on_struct).pack(anchor="w", padx=4)
        ttk.Button(g, text="Placer le hotspot en position défavorable (coin)",
                   command=self.bad_position).pack(fill="x", padx=4, pady=3)
        ttk.Button(g, text="★ Rechercher la position optimale du hotspot",
                   command=self.optimize).pack(fill="x", padx=4, pady=(2, 6))

        a = ttk.LabelFrame(inner, text="Architecture : murs intérieurs")
        a.pack(fill="x", padx=6, pady=4)
        self.lb = tk.Listbox(a, height=7, exportselection=False)
        self.lb.pack(fill="x", padx=4, pady=3)
        self.lb.bind("<<ListboxSelect>>", lambda e: self.load_wall())
        ttk.Label(a, text="Matériau :").pack(anchor="w", padx=4)
        cb = ttk.Combobox(a, textvariable=self.mat, values=WALL_MATS, state="readonly")
        cb.pack(fill="x", padx=4)
        cb.bind("<<ComboboxSelected>>", lambda e: self.on_wall_edit())
        self.slider(a, "Épaisseur (cm)", self.thick, 5, 40, 1, self.on_wall_edit)
        ttk.Button(a, text="Appliquer matériau + épaisseur à tous les murs",
                   command=self.apply_all).pack(fill="x", padx=4, pady=2)
        ef = ttk.Frame(a)
        ef.pack(fill="x", padx=4, pady=3)
        for i, lab in enumerate(["x1", "y1", "x2", "y2"]):
            ttk.Label(ef, text=lab).grid(row=0, column=2 * i)
            ttk.Entry(ef, textvariable=self.ent[i], width=5).grid(row=0, column=2 * i + 1, padx=2)
        bf = ttk.Frame(a)
        bf.pack(fill="x", padx=4)
        ttk.Button(bf, text="Appliquer position", command=self.apply_geom).pack(side="left", expand=True, fill="x")
        ttk.Button(bf, text="Ajouter mur", command=self.add_wall).pack(side="left", expand=True, fill="x")
        ttk.Button(bf, text="Supprimer", command=self.del_wall).pack(side="left", expand=True, fill="x")
        ttk.Label(a, text="Portes / fenêtres du mur sélectionné (position en m depuis le point 1) :").pack(anchor="w", padx=4, pady=(6, 0))
        df = ttk.Frame(a)
        df.pack(fill="x", padx=4, pady=2)
        ttk.Entry(df, textvariable=self.door_pos, width=6).pack(side="left")
        ttk.Combobox(df, textvariable=self.door_kind, values=OPEN_KINDS, state="readonly", width=20).pack(side="left", padx=3)
        ttk.Button(df, text="+", width=3, command=self.add_door).pack(side="left")
        ttk.Button(a, text="Retirer les ouvertures de ce mur", command=self.clear_doors).pack(fill="x", padx=4, pady=(0, 6))

        ttk.Button(inner, text="Hypothèses physiques et limites du modèle",
                   command=self.show_help).pack(fill="x", padx=6, pady=6)

        # ---- zone centrale
        self.fig = Figure(figsize=(7, 5.5), dpi=100)
        self.ax = self.fig.add_subplot(111)
        self.canvas = FigureCanvasTkAgg(self.fig, master=center)
        self.canvas.get_tk_widget().pack(fill="both", expand=True)
        self.canvas.mpl_connect("button_press_event", self.on_press)
        self.canvas.mpl_connect("motion_notify_event", self.on_motion)
        self.canvas.mpl_connect("button_release_event", lambda e: setattr(self, "dragging", False))

        # ---- zone droite
        ttk.Label(right, text="Résultats", font=("TkDefaultFont", 12, "bold")).pack(pady=4)
        self.txt = tk.Text(right, width=50, wrap="none", font=("Courier", 9), state="disabled",
                           background="#f7f7f7")
        self.txt.tag_configure("h", font=("Courier", 9, "bold"), foreground="#0d47a1")
        self.txt.tag_configure("good", foreground="#2e7d32")
        self.txt.tag_configure("bad", foreground="#c62828")
        self.txt.pack(fill="both", expand=True, padx=6, pady=4)

    def slider(self, parent, text, var, lo, hi, res, cmd):
        tk.Scale(parent, label=text, variable=var, from_=lo, to=hi, resolution=res, orient="horizontal",
                 length=310, command=lambda v: cmd()).pack(fill="x", padx=4)

    # ---------------- evenements ----------------
    def schedule(self):
        if self.job:
            self.root.after_cancel(self.job)
        self.job = self.root.after(15, self.update_map)

    def on_hotspot(self):
        self.schedule()

    def on_struct(self):
        self.opt = None
        self.schedule()

    def set_band(self, f):
        self.f.set(f)
        self.on_struct()

    def on_press(self, e):
        if e.inaxes is self.ax and e.button == 1 and e.xdata is not None:
            self.dragging = True
            self.move_to(e.xdata, e.ydata)

    def on_motion(self, e):
        if self.dragging and e.inaxes is self.ax and e.xdata is not None:
            self.move_to(e.xdata, e.ydata)

    def move_to(self, x, y):
        self.x.set(round(float(np.clip(x, 0, W_B)), 2))
        self.y.set(round(float(np.clip(y, 0, H_B)), 2))
        self.schedule()

    def bad_position(self):
        self.x.set(0.4)
        self.y.set(9.6)
        self.schedule()

    # ---------------- murs ----------------
    def refresh_list(self, sel=None):
        self.lb.delete(0, "end")
        for i, w in enumerate(self.walls):
            self.lb.insert("end", f"{i + 1}. {w['name']}  [{w['mat']}, {w['t']:.0f} cm]")
        if self.walls and sel is not None:
            sel = min(max(sel, 0), len(self.walls) - 1)
            self.lb.selection_clear(0, "end")
            self.lb.selection_set(sel)
            self.load_wall()

    def sel(self):
        s = self.lb.curselection()
        return s[0] if s else None

    def load_wall(self):
        i = self.sel()
        if i is None:
            return
        w = self.walls[i]
        self.loading = True
        self.mat.set(w["mat"])
        self.thick.set(w["t"])
        for v, val in zip(self.ent, (*w["p1"], *w["p2"])):
            v.set(f"{val:g}")
        self.loading = False

    def on_wall_edit(self):
        i = self.sel()
        if self.loading or i is None:
            return
        self.walls[i]["mat"] = self.mat.get()
        self.walls[i]["t"] = float(self.thick.get())
        w = self.walls[i]
        self.lb.delete(i)
        self.lb.insert(i, f"{i + 1}. {w['name']}  [{w['mat']}, {w['t']:.0f} cm]")
        self.lb.selection_set(i)
        self.on_struct()

    def apply_all(self):
        for w in self.walls:
            w["mat"] = self.mat.get()
            w["t"] = float(self.thick.get())
        self.refresh_list(self.sel() or 0)
        self.on_struct()

    def read_geom(self):
        try:
            v = [float(s.get().replace(",", ".")) for s in self.ent]
        except ValueError:
            messagebox.showerror("Erreur", "Coordonnées invalides.")
            return None
        return (v[0], v[1]), (v[2], v[3])

    def apply_geom(self):
        i, g = self.sel(), self.read_geom()
        if i is None or g is None:
            return
        self.walls[i]["p1"], self.walls[i]["p2"] = g
        self.on_struct()

    def add_wall(self):
        g = self.read_geom()
        if g is None:
            return
        self.walls.append(dict(name=f"Mur ajouté {len(self.walls) + 1}", p1=g[0], p2=g[1],
                               mat=self.mat.get(), t=float(self.thick.get()), doors=[]))
        self.refresh_list(len(self.walls) - 1)
        self.on_struct()

    def del_wall(self):
        i = self.sel()
        if i is None:
            return
        del self.walls[i]
        self.refresh_list(i)
        self.on_struct()

    def add_door(self):
        i = self.sel()
        if i is None:
            return
        try:
            c = float(self.door_pos.get().replace(",", "."))
        except ValueError:
            return
        kind = self.door_kind.get()
        wd = 1.2 if "Fenêtre" in kind else 0.9
        self.walls[i]["doors"].append((c, wd, kind))
        self.on_struct()

    def clear_doors(self):
        i = self.sel()
        if i is not None:
            self.walls[i]["doors"] = []
            self.on_struct()

    # ---------------- calcul ----------------
    def tables(self):
        return build_tables(self.walls, self.f.get(), self.open_doors.get())

    def stats(self, P, rx):
        thr = self.thr.get()
        rooms = []
        for i, (n, *_r) in enumerate(ROOMS):
            m = ROOM_IDX == i
            rooms.append((n, float((rx[m] >= thr).mean() * 100), float(rx[m].mean())))
        return dict(pos=P, cov=float((rx >= thr).mean() * 100), mn=float(rx.min()), mx=float(rx.max()),
                    mean=float(rx.mean()), rooms=rooms,
                    bands=[float(((rx >= a) & (rx < b)).mean() * 100) for a, b in
                           [(-300, -75), (-75, -67), (-67, -55), (-55, 100)]])

    def update_map(self):
        self.job = None
        P = (self.x.get(), self.y.get())
        tabs, dt = self.tables()
        rx = rx_map(P, GX, GY, self.walls, tabs, dt, self.pw.get(), self.f.get(), self.nexp.get())
        st = self.stats(P, rx)
        self.draw(rx, P)
        self.show_results(st)

    def draw(self, rx, P):
        ax = self.ax
        ax.clear()
        ax.imshow(rx, origin="lower", extent=(0, W_B, 0, H_B), cmap=CMAP, norm=NORM,
                  interpolation="nearest", zorder=1)
        thr = self.thr.get()
        ax.contour(GX, GY, rx, levels=[thr], colors="k", linewidths=1.0, linestyles="--", zorder=2)
        for p1, p2 in EXT:
            ax.plot([p1[0], p2[0]], [p1[1], p2[1]], color="black", lw=5, solid_capstyle="projecting", zorder=3)
        for w in self.walls:
            self.draw_wall(w)
        for i, (n, x0, y0, x1, y1) in enumerate(ROOMS):
            m = ROOM_IDX == i
            ax.text((x0 + x1) / 2, (y0 + y1) / 2 + (0.35 if y1 - y0 > 2 else 0),
                    f"{n}\n{rx[m].mean():.0f} dBm", ha="center", va="center", fontsize=8, zorder=6,
                    bbox=dict(boxstyle="round,pad=0.2", fc="white", ec="none", alpha=0.75))
        ax.plot(*P, marker="*", ms=20, mfc="white", mec="black", mew=1.5, ls="", zorder=8)
        if self.opt:
            b, o = self.opt["before"]["pos"], self.opt["pos"]
            ax.plot(*b, marker="X", ms=11, mfc="#9e9e9e", mec="black", ls="", zorder=7)
            ax.plot(*o, marker="P", ms=14, mfc="#e040fb", mec="black", ls="", zorder=7)
        ax.set_xlim(-0.3, W_B + 0.3)
        ax.set_ylim(-0.3, H_B + 0.3)
        ax.set_aspect("equal")
        ax.set_xlabel("x (m)")
        ax.set_ylabel("y (m)")
        ax.set_title(f"Puissance reçue (dBm) – f = {self.f.get():.2f} GHz, Pt = {self.pw.get():.1f} dBm  "
                     f"(glisser le hotspot à la souris)", fontsize=10)
        h = [Patch(fc="#43a047", label="≥ −55 dBm : fort"), Patch(fc="#fdd835", label="−67 à −55 : satisfaisant"),
             Patch(fc="#fb8c00", label="−75 à −67 : faible"), Patch(fc="#e53935", label="< −75 : très faible"),
             Line2D([], [], marker="*", ms=14, mfc="white", mec="k", ls="", label="Hotspot"),
             Line2D([], [], color="k", ls="--", label=f"Isoligne seuil {thr:.0f} dBm")]
        if self.opt:
            h += [Line2D([], [], marker="X", mfc="#9e9e9e", mec="k", ls="", label="Avant optimisation"),
                  Line2D([], [], marker="P", mfc="#e040fb", mec="k", ls="", label="Position optimale")]
        ax.legend(handles=h, loc="upper center", bbox_to_anchor=(0.5, -0.1), ncol=4, fontsize=8, frameon=False)
        self.fig.subplots_adjust(left=0.07, right=0.98, top=0.93, bottom=0.2)
        self.canvas.draw_idle()

    def draw_wall(self, w):
        A, B = np.array(w["p1"], float), np.array(w["p2"], float)
        s = B - A
        L = np.hypot(*s)
        if L < 1e-9:
            return
        u = s / L
        n = np.array([-u[1], u[0]])
        hw = w["t"] / 200.0

        def quad(a, b, color, z):
            pts = [a + n * hw, b + n * hw, b - n * hw, a - n * hw]
            self.ax.add_patch(Polygon(pts, closed=True, fc=color, ec="black", lw=0.6, zorder=z))
        quad(A, B, MAT_COLOR[w["mat"]], 4)
        for c, wd, kind in w["doors"]:
            a0, b0 = max(c - wd / 2, 0), min(c + wd / 2, L)
            col = {"Porte": "#c8a165", "Ouver": "white", "Fenêt": "#b3e5fc"}[kind[:5]]
            quad(A + u * a0, A + u * b0, col, 5)

    def show_results(self, st):
        T = self.txt
        T.configure(state="normal")
        T.delete("1.0", "end")
        thr = self.thr.get()

        def w(s, tag=None):
            T.insert("end", s, tag)
        w("COUVERTURE ACTUELLE\n", "h")
        tag = "good" if st["cov"] >= 80 else ("bad" if st["cov"] < 50 else None)
        w(f"Surface ≥ {thr:.0f} dBm : {st['cov']:.1f} %\n", tag)
        w(f"Puissance min / moy / max :\n   {st['mn']:.1f} / {st['mean']:.1f} / {st['mx']:.1f} dBm\n")
        b = st["bands"]
        w(f"Vert {b[3]:.0f}% | Jaune {b[2]:.0f}% | Orange {b[1]:.0f}% | Rouge {b[0]:.0f}%\n\n")
        w("PIÈCES (les moins couvertes d'abord)\n", "h")
        for n, c, m in sorted(st["rooms"], key=lambda r: r[1]):
            w(f"{n:<12s}{c:5.0f} %   {m:6.1f} dBm\n", "bad" if c < 50 else ("good" if c > 95 else None))
        w(f"\nPosition actuelle : ({st['pos'][0]:.2f} m ; {st['pos'][1]:.2f} m)\n\n")
        w("OPTIMISATION\n", "h")
        if self.opt:
            b_, a_ = self.opt["before"], self.opt["after"]
            w(f"Position optimale : ({self.opt['pos'][0]:.2f} ; {self.opt['pos'][1]:.2f}) m\n")
            w(f"{'':<14s}{'Avant':>9s}{'Après':>9s}\n")
            w(f"{'Position':<14s}{'(%.1f;%.1f)' % b_['pos']:>9s}{'(%.1f;%.1f)' % a_['pos']:>9s}\n")
            w(f"{'Couverture %':<14s}{b_['cov']:9.1f}{a_['cov']:9.1f}\n")
            w(f"{'P moyenne':<14s}{b_['mean']:9.1f}{a_['mean']:9.1f}\n")
            w(f"{'P min':<14s}{b_['mn']:9.1f}{a_['mn']:9.1f}\n")
            gain = a_["cov"] - b_["cov"]
            w(f"Gain : {gain:+.1f} points de couverture\n", "good" if gain > 0 else None)
            w("\nPièces avant → après :\n")
            for (n, c0, _), (_n, c1, _m) in zip(b_["rooms"], a_["rooms"]):
                w(f"{n:<12s}{c0:5.0f} % → {c1:4.0f} %\n")
        else:
            w("Aucune optimisation valide.\nCliquez sur « Rechercher la position optimale ».\n")
        T.configure(state="disabled")

    # ---------------- optimisation ----------------
    def optimize(self):
        P0 = (self.x.get(), self.y.get())
        tabs, dt = self.tables()
        f, pw, ne, thr = self.f.get(), self.pw.get(), self.nexp.get(), self.thr.get()
        ox, oy = np.meshgrid(np.arange(0.125, W_B, 0.25), np.arange(0.125, H_B, 0.25))  # grille d'evaluation

        def score(P):
            r = rx_map(P, ox, oy, self.walls, tabs, dt, pw, f, ne)
            return (r >= thr).mean() + 1e-6 * r.mean()

        rx0 = rx_map(P0, GX, GY, self.walls, tabs, dt, pw, f, ne)
        before = self.stats(P0, rx0)
        self.root.config(cursor="watch")
        cands = [(x, y) for x in np.arange(0.25, W_B, 0.5) for y in np.arange(0.25, H_B, 0.5)
                 if dist_to_walls((x, y), self.walls) > 0.1]
        best, bs = P0, -1
        for k, P in enumerate(cands):
            s = score(P)
            if s > bs:
                best, bs = P, s
            if k % 60 == 0:
                self.root.title(f"Optimisation... {100 * k // len(cands)} %")
                self.root.update_idletasks()
        c = best                                           # raffinement local (pas 0,1 m)
        for x in np.arange(max(c[0] - 0.5, 0.1), min(c[0] + 0.5, W_B - 0.1) + 1e-9, 0.1):
            for y in np.arange(max(c[1] - 0.5, 0.1), min(c[1] + 0.5, H_B - 0.1) + 1e-9, 0.1):
                if dist_to_walls((x, y), self.walls) > 0.1:
                    s = score((x, y))
                    if s > bs:
                        best, bs = (x, y), s
        best = (round(float(best[0]), 2), round(float(best[1]), 2))
        rx1 = rx_map(best, GX, GY, self.walls, tabs, dt, pw, f, ne)
        self.root.config(cursor="")
        self.root.title("Wi-Fi Smart Coverage – couverture Wi-Fi d'un bâtiment")
        self.x.set(best[0])
        self.y.set(best[1])
        self.opt = dict(before=before, after=self.stats(best, rx1), pos=best)
        self.update_map()

    def show_help(self):
        t = tk.Toplevel(self.root)
        t.title("Hypothèses physiques et limites")
        tx = tk.Text(t, width=110, height=32, wrap="word", padx=8, pady=8)
        tx.insert("1.0", HELP)
        tx.configure(state="disabled")
        tx.pack(fill="both", expand=True)


if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
