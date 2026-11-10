# Memoriz · Livre d'or vidéo

Application de photobooth vidéo pour tablette Android : les invités enregistrent un message vidéo en autonomie, avec la caméra et le micro de ton choix (USB externes ou intégrés). Tout fonctionne **sans internet** une fois l'app installée.

## Ce que fait l'app

**Côté invités**
- Écran d'accueil personnalisé par événement (titre, date, message, couleurs, polices, image de fond, logo)
- Prénom facultatif (ajouté au nom du fichier)
- Questions d'inspiration : au choix, tirées au hasard (bouton « Autre question ») ou désactivées
- Aperçu miroir, compte à rebours avec bips, jauge du micro pour vérifier que le son passe
- Enregistrement avec durée max, chrono, barre de progression qui clignote les 10 dernières secondes
- Relecture avant validation, nombre de reprises limité
- Écran « Merci {prenom} ! » puis retour automatique à l'accueil
- Retour à l'accueil si un invité abandonne en cours de route (si l'invité part pendant la relecture, son message est gardé)

**Dans la vidéo enregistrée** : titre + date en bas, logo en haut à droite, cadre PNG par-dessus (chaque option se coche). La vidéo n'est pas en miroir même si l'aperçu l'est.

**Côté admin** (code PIN, 1234 par défaut, **à changer**)
- Plusieurs événements préparés à l'avance, un seul actif à la fois (dupliquer pour gagner du temps)
- Choix caméra / micro, qualité 720p ou 1080p, format paysage / portrait / auto, rotation si la caméra est montée de travers
- Liste des vidéos avec lecture, téléchargement, partage (Drive, WhatsApp…), suppression
- **Export ZIP** de tout l'événement + un fichier `liste-des-messages.csv` (prénom, question, durée, heure)
- Diagnostic complet + enregistrement test de 5 s

**Mode verrouillé** : plein écran, écran toujours allumé, bouton Retour neutralisé, clic droit et zoom bloqués, accès admin caché. Pour un verrouillage total, combine avec l'épinglage d'écran d'Android (voir plus bas).

## Où vont les vidéos ?

1. **Dans l'app** (stockage interne de la tablette, rangé par événement) : c'est la copie de référence, visible dans Admin → Vidéos.
2. **Dans Téléchargements** : chaque vidéo y est copiée automatiquement dès qu'elle est validée (option cochée par défaut). Nom de fichier : `Mariage-Sarah-et-Yanis_2027-07-12_22h41-05_Lea.mp4`.
3. Sur un ordinateur (Chrome/Edge), tu peux en plus choisir un vrai dossier : un sous-dossier par événement y est créé.

À la première copie, Chrome peut demander l'autorisation de télécharger plusieurs fichiers : accepte-la pendant ton test, pas devant les invités.

## Mise en ligne (une seule fois, gratuit)

La caméra n'est accessible qu'en `https`. Le plus simple avec ce que tu utilises déjà :

1. Crée un dépôt GitHub (ex. `memoriz-videobooth`) et mets-y tout le contenu de ce dossier.
2. Settings → Pages → Branch `main` / root → Save.
3. L'app est sur `https://<ton-pseudo>.github.io/memoriz-videobooth/`.

Netlify Drop (glisser le dossier sur app.netlify.com/drop) marche aussi.

## Installation sur la tablette

1. Ouvre l'adresse dans **Chrome** (pas Samsung Internet).
2. Autorise la caméra et le micro.
3. Menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »). Lance-la ensuite toujours depuis cette icône : elle s'ouvre en plein écran et marche hors ligne.
4. Ouvre l'admin (appui long 2 s ou 5 tapes dans le **coin en haut à gauche**), change le code, prépare l'événement.
5. Fais un enregistrement complet avec internet : ça met aussi les polices en cache pour le hors-ligne.

### Verrouiller la tablette (épinglage d'écran)
Paramètres → Sécurité → **Épingler les applications** → activer + « Demander le code avant de désépingler ». Puis Applis récentes → icône de l'app → Épingler. Les invités ne peuvent plus sortir de l'app.
Pense aussi à : mode Ne pas déranger, luminosité fixe, mise en veille au maximum, notifications coupées.

## Matériel : à vérifier AVANT d'acheter

**Point important : toutes les tablettes Android ne reconnaissent pas les webcams USB.** Même avec un port USB-C, beaucoup de modèles n'exposent pas une webcam externe aux applications (seules des applis spécialisées avec leur propre pilote y arrivent). Ça dépend du fabricant et de la version d'Android (14 et plus de préférence).

Le test est simple : branche la webcam, ouvre l'app → Admin → **Diagnostic**. Si elle apparaît dans « Caméras détectées » et que l'enregistrement test fonctionne, c'est bon. Achète la tablette et la webcam chez un vendeur qui accepte les retours (30 jours) pour pouvoir faire ce test.

- **Micro USB-C** : la plupart des micros USB (classe audio standard) fonctionnent bien sur Android. Un micro-cravate sans fil type Rode Wireless GO / DJI Mic / Boya avec récepteur USB-C donne un son bien meilleur qu'un micro de webcam.
- **Caméra + micro + charge** : la tablette n'a qu'un port. Il faut un **hub USB-C avec Power Delivery** (charge passante) pour brancher la webcam, le récepteur micro et le chargeur en même temps. Sans charge, la tablette ne tiendra pas une soirée en filmant.
- **Webcam** : une webcam UVC « plug and play » Full HD (Logitech C920/C922, Elgato Facecam…). Évite les modèles qui demandent un logiciel.
- **Plan B** : si la webcam n'est pas reconnue, l'app marche avec la caméra frontale de la tablette, et avec un micro USB externe.

## Format des fichiers

Sur Android récent, les vidéos sont en **MP4 H.264**, lisibles partout (iPhone, Windows, Mac, logiciels de montage). Le Diagnostic l'indique. Si une vieille tablette ne propose que le WebM, les vidéos se lisent sur ordinateur (VLC) et se convertissent en MP4 avec HandBrake.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Écrans invités + administration |
| `style.css` | Mise en forme |
| `app.js` | Logique : caméra, enregistrement, parcours, admin, verrouillage |
| `db.js` | Stockage local (IndexedDB) |
| `zip.js` | Export ZIP sans recharger les vidéos en mémoire |
| `sw.js` | Fonctionnement hors ligne |
| `manifest.webmanifest`, `icons/` | Installation comme une application |

Pour publier une mise à jour, change `VERSION` dans `sw.js` (et `APP_VERSION` dans `app.js`), sinon la tablette garde l'ancienne version en cache.
