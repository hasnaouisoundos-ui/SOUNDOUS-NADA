WI-FI SMART COVERAGE - Mini-projet GSR1

1) Extraire le ZIP, puis dans VS Code : Fichier > Ouvrir le dossier > WiFi_Smart_Coverage
2) Installer l'extension "Python" si VS Code le propose.
3) Ouvrir le terminal de VS Code (Ctrl+`) et taper :
       pip install -r requirements.txt
   (Linux : sudo apt install python3-tk  si tkinter manque)
4) Lancer : ouvrir wifi_smart_coverage.py puis F5 (ou bouton Run),
   ou dans le terminal :  python wifi_smart_coverage.py
   (Windows si "python" ne marche pas : py wifi_smart_coverage.py)

Tests de demonstration :
 1. Position : deplacer le hotspot de la Salle 1 vers le Couloir.
 2. Epaisseur : "Mur Salle2/Bureau", augmenter l'epaisseur.
 3. Materiau : "Mur Salle1/Salle2" Platre -> Beton.
 4. Frequence : 2,4 GHz puis 5 GHz (ou curseur libre 2-6 GHz).
 5. Optimisation : "Position defavorable" puis "Rechercher la position optimale".
