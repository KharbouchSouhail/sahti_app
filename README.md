# صحتي · Sehhati

Application web progressive (PWA) bilingue **arabe (RTL) / français (LTR)** pour conserver l’historique des consultations médicales d’un patient et permettre à un médecin d’ajouter une consultation à un dossier via un **QR code temporaire** ou un **code de remise**.

> Projet de démonstration. Les données de santé sont sensibles : avant tout usage réel, vérifiez la conformité avec la loi marocaine 09-08 et les recommandations de la CNDP (voir plus bas).

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Partage avec consentement](#partage-avec-consentement)
- [Stack](#stack)
- [Démarrage rapide](#démarrage-rapide)
- [Comptes de démonstration](#comptes-de-démonstration)
- [Parcours de test](#parcours-de-test)
- [Sécurité et confidentialité](#sécurité-et-confidentialité)
- [Structure du projet](#structure-du-projet)
- [Scripts](#scripts)
- [Export PDF](#export-pdf)
- [Tests](#tests)
- [Limites connues](#limites-connues)
- [CNDP et loi 09-08](#cndp-et-loi-09-08)

---

## Fonctionnalités

### Patient

- Tableau de bord : nombre de consultations, spécialités, dernier suivi, dossier santé (groupe sanguin, allergies, maladies chroniques).
- Historique des consultations groupé par mois, recherche, filtres (ce mois / cette année / par médecin), masquage et réaffichage.
- Fiche de consultation complète : motif, symptômes, examen, diagnostic, traitement, ordonnance, recommandations, date de suivi, pièces jointes, export PDF.
- **Mon QR** : jeton à usage unique valable **5 minutes**, QR code + code à 8 caractères, compte à rebours, attente du scan, régénération. **Partage avec portée** : avant de générer son QR, le patient choisit explicitement ce qu’il autorise.
- **Ajouter par code** : scan du QR de remise ou saisie manuelle, aperçu avant confirmation, ajout au dossier.
- Profil : informations personnelles, groupe sanguin, allergies, maladies chroniques.
- **Accès à mon dossier** : liste des médecins ayant un accès (actif ou expiré), portée et compte à rebours, révocation en un clic, journal « Qui a consulté mon dossier » (lecture, fichiers, liaisons, révocations).
- Notifications lors de l’ajout d’une consultation et lors de l’ouverture d’un accès à son dossier.

### Médecin

- Tableau de bord : consultations du jour, brouillons, consultations prêtes à lier, liaisons du mois, listes d’actions.
- Création de consultation en 4 étapes (motif/examen/traitement/révision) avec **sauvegarde automatique** (debounce 1,4 s + intervalle de 15 s), ordonnance multi-lignes et pièces jointes (PDF/JPG/PNG, 10 Mo, 5 fichiers).
- Liste de ses consultations avec recherche, filtres par statut et pagination.
- Fiche de consultation en lecture seule après liaison, impression.
- **Liaison** en fin de consultation :
  - scan du QR du patient ;
  - saisie du code à 8 caractères du patient ;
  - génération d’un **code de remise valable 72 h**, QR imprimable à remettre au patient.
- **Accès au dossier (consentement)** : « Dossiers patients » dans la navigation. Ouverture du dossier par scan ou saisie du code (portée infos vitales ou accès complet). Dossier en lecture seule : identité, groupe sanguin, allergies, maladies chroniques, historique complet des consultations (tous médecins confondus, hors consultations masquées par le patient) avec fiche détaillée et pièces jointes. Liaison d’une consultation en un clic lorsque le patient a autorisé l’accès.
- Profil professionnel (spécialité, n° d’ordre, cabinet, ville, téléphone).

### Transverse

- Deux rôles uniquement : `PATIENT` et `DOCTOR`.
- Interface bilingue complète, arabe par défaut avec chiffres latins et dates grégoriennes.
- Design responsive : barre latérale sur desktop, navigation basse sur mobile.
- Notifications in-app, journal d’audit, limitation de débit.

---

## Partage avec consentement

Le patient contrôle ce que chaque QR ouvre. Trois portées :

| Portée | Le médecin voit | Usage |
| --- | --- | --- |
| `LINK_ONLY` | Rien — le QR rattache seulement la consultation (comportement historique) | Fin de consultation |
| `VITALS` | Âge, sexe, groupe sanguin, allergies, maladies chroniques | Urgence, prescription sûre |
| `FULL` | Infos vitales + **historique complet** (tous médecins confondus, hors consultations masquées par le patient) et ses documents | Suivi, nouveau médecin |

Règles :

- **Choix explicite obligatoire** : aucune portée par défaut, le bouton de génération reste inactif tant que le patient n’a pas choisi.
- Le jeton QR garde ses propriétés : **5 minutes**, usage unique.
- Un scan `VITALS` ou `FULL` crée un **`AccessGrant`** : lecture seule, limité dans le temps (1 h, 2 h ou 24 h au choix du patient), **révocable à tout moment** depuis « Accès à mon dossier » — la révocation est immédiate (le prochain appel du médecin renvoie 403 et l’écran se verrouille).
- Un seul grant actif par couple patient/médecin : un nouveau scan prolonge ou modifie la portée.
- Les consultations masquées par le patient sont exclues de l’historique.
- Le médecin ne voit que les patients qui lui ont ouvert un accès (page « Dossiers patients »).
- Le patient est notifié à chaque ouverture d’accès et dispose d’un journal « Qui a consulté mon dossier ».
- En fin de consultation, si l’accès est encore actif, la consultation est rattachée **en un clic** (aucun nouveau QR à fournir) — sinon, le médecin repasse par scan, code ou code de remise.

---

## Stack

| Domaine | Choix |
| --- | --- |
| Framework | Next.js 14 (App Router) + TypeScript |
| UI | Tailwind CSS, composants inspirés de shadcn/ui, Lucide |
| Base de données | PostgreSQL + Prisma 5 |
| Authentification | NextAuth (Credentials, JWT) + bcryptjs |
| i18n | next-intl (`ar` / `fr`) |
| Formulaires | react-hook-form + zod côté API |
| Données client | TanStack Query |
| QR | `qrcode.react`, `@yudiel/react-qr-scanner` |
| Fichiers | stockage local `uploads/`, service authentifié |
| Tests | Vitest |

---

## Démarrage rapide

### Option A — Docker Compose (recommandé)

```bash
docker compose up --build -d
docker compose exec app npm run db:seed
```

L’application est disponible sur <http://localhost:3000>. PostgreSQL est exposé sur le port `5433` de l’hôte.

Sans Docker, lancez uniquement la base :

```bash
docker compose up -d db
```

### Option B — Installation locale

Prérequis : Node.js 20+, PostgreSQL 14+ (testé avec PostgreSQL 17).

1. Créez une base `sehhati` et un utilisateur, ou utilisez une instance locale.
2. Copiez la configuration :

   ```bash
   cp .env.example .env
   ```

3. Renseignez `.env` :

   ```env
   DATABASE_URL="postgresql://postgres@localhost:5433/sehhati?schema=public"
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="remplacez-par-openssl-rand-base64-32"
   NEXT_PUBLIC_APP_URL="http://localhost:3000"
   ```

   > Le projet a été développé avec une instance PostgreSQL locale sur le port **5433** en authentification `trust` (`postgres@localhost:5433/sehhati`). Adaptez l’URL à votre installation.

4. Installez, migrez et alimentez la base :

   ```bash
   npm install
   npx prisma migrate deploy
   npm run db:seed
   ```

5. Lancez le serveur de développement :

   ```bash
   npm run dev
   ```

   Ouvrez <http://localhost:3000> (redirection automatique vers `/ar`).

### Production locale

```bash
npm run build
npm run start
```

---

## Comptes de démonstration

Mot de passe commun : **`Demo1234!`**

| Rôle | E-mail | Nom |
| --- | --- | --- |
| Médecin | `dr.alami@demo.ma` | Dr. Youssef Alami — Cardiologie |
| Médecin | `dr.benani@demo.ma` | Dr. Salma Benani — Médecine générale |
| Patient | `ahmed@demo.ma` | Ahmed Benali (6 consultations liées) |
| Patient | `salma@demo.ma` | Salma Idrissi (1 consultation liée) |

Le seed crée aussi des brouillons, des consultations terminées non liées et des pièces jointes PDF de démonstration dans `uploads/seed/`.

Pour recréer les données : `npm run db:seed` (le script est idempotent et remet les comptes de démo à zéro).

---

## Parcours de test

### 1. Médecin : créer puis lier une consultation

1. Connexion avec `dr.alami@demo.ma`.
2. **Nouvelle consultation** → renseignez motif, diagnostic et traitement (ou recommandations). La sauvegarde est automatique.
3. Étape **Révision** → **Terminer la consultation**.
4. Sur l’écran de liaison, choisissez :
   - **Scanner le QR du patient** : ouvrez « Mon QR » dans un autre navigateur connecté comme patient ;
   - **Saisir le code du patient** : les 8 caractères affichés sous le QR ;
   - **Générer un code de remise** : affiche un QR imprimable valable 72 h.

### 2. Patient : voir la consultation apparaître

1. Connexion avec `ahmed@demo.ma`.
2. **Mon QR** → choisissez la portée (par ex. `LINK_ONLY`) puis **Générer mon QR**. Laissez l’écran ouvert : la page interroge le serveur toutes les 3 secondes.
3. Après le scan par le médecin, l’écran affiche la réussite et la consultation apparaît immédiatement dans l’historique + une notification.
4. Pour un partage plus large, choisissez `VITALS` ou `FULL` et la durée (1 h / 2 h / 24 h) : le QR est alors un « QR de partage » qui ouvre un grant de lecture seule.

### 3. Patient : ajouter avec un code de remise

1. Le médecin génère le code de remise et l’imprime ou le copie.
2. Le patient ouvre **Ajouter par code** → scan du QR ou saisie des 8 caractères.
3. Un aperçu (médecin, date, motif) s’affiche avant confirmation.
4. Après confirmation, la consultation passe en `LINKED` et devient visible.

### 4. Cas d’erreur

- Code patient expiré (> 5 min) → `LINK_EXPIRED`, invitation à régénérer.
- Code déjà utilisé → `LINK_USED`.
- Code de remise expiré (> 72 h) ou déjà consommé → `CLAIM_EXPIRED` / `CLAIM_USED`.
- Trop de tentatives → `RATE_LIMITED` (blocage 15 minutes après 10 échecs).
- Un patient ne peut ni voir ni réclamer la consultation d’un autre patient ; un médecin ne peut lier que ses propres consultations.

### 5. Export PDF et impression

- Fiche patient : bouton **Exporter en PDF** (voir la note ci-dessous).
- Code de remise : bouton **Imprimer le code** ; seule la carte blanche est imprimée grâce à la règle `.no-print`.

### 6. Patient : ouvrir un accès et le révoquer

1. Connexion avec `ahmed@demo.ma` → **Mon QR** → portée `VITALS` ou `FULL` → durée au choix → **Générer mon QR**.
2. Connexion avec `dr.benani@demo.ma` → **Dossiers patients** → **Ouvrir un dossier patient** → scannez (ou saisissez le code).
3. Le dossier s’ouvre en lecture seule : identité, constantes, allergies, maladies chroniques ; onglet **Historique** (uniquement en portée `FULL`).
4. Retour chez le patient : **Accès à mon dossier** → le grant apparaît avec le compte à rebours et les accès récents du médecin ; bouton **Révoquer** → l’accès disparaît et le médecin est bloqué.

### 7. Liaison en un clic avec un grant actif

1. Connexion médecin → depuis le dossier patient, **Démarrer une consultation pour ce patient**.
2. Remplissez et terminez la consultation.
3. Sur l’écran de fin, la carte **« Ajouter au dossier de … »** (portée indiquée) lie la consultation en un clic — la note de bas de page passe à « accès actif ».

---

## Sécurité et confidentialité

- **Aucun jeton brut n’est stocké** : seuls les hachages SHA-256 des jetons et codes sont en base.
- **Jeton patient** : 32 caractères, TTL **5 minutes**, à usage unique, consommé de façon atomique (`updateMany` conditionnel).
- **Code patient** : 8 caractères sans `0/O/1/I`, affiché avec un tiret (`K7M2-9QXP`).
- **Code de remise médecin** : TTL **72 heures**, à usage unique, lié à une seule consultation.
- **Codes à usage unique** : la consommation et la liaison se font dans une transaction ; un second essai échoue.
- **Limitation de débit** : 5 tentatives/minute, blocage 15 minutes après 10 échecs (implémentation mémoire, suffisante pour une instance unique).
- **Grant de lecture** : `AccessGrant` (portée `VITALS`/`FULL`, TTL choisi par le patient : 1 h / 2 h / 24 h, révocable) ; contrôle d’accès serveur à chaque appel (`assertGrant`) ; les consultations `hiddenByPatient` sont exclues ; la révocation prend effet immédiatement.
- **Fichiers** : avec un grant `FULL` actif, un médecin peut lire les pièces jointes du patient (journal `FILE_DOWNLOADED`).
- **Cloisonnement des rôles** : middleware + vérification serveur à chaque route API ; chaque requête vérifie la propriété de la ressource (`doctorId`, `patientId`).
- **Journal d’audit** : création, modification, fin de consultation, génération de code, succès/échec de liaison, ouverture/fermeture d’accès (`ACCESS_GRANTED`, `ACCESS_REVOKED`, `ACCESS_EXPIRED_ATTEMPT`), consultations de dossier (`PATIENT_FILE_VIEWED`), liaisons via grant (`LINK_VIA_GRANT`).
- **Fichiers** : jamais servis depuis `/public` ; téléchargement via `/api/files/[id]` avec contrôle d’accès.
- **Mots de passe** : bcrypt (12 rounds), jamais renvoyés par l’API.
- En production : HTTPS obligatoire, `NEXTAUTH_SECRET` robuste, sauvegardes chiffrées, stockage objet privé, rate limiting distribué (Redis).

### Variables d’environnement

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | Connexion PostgreSQL |
| `NEXTAUTH_URL` | URL publique de l’application |
| `NEXTAUTH_SECRET` | Secret de signature JWT (`openssl rand -base64 32`) |
| `NEXT_PUBLIC_APP_URL` | URL publique utilisée côté client |

---

## Structure du projet

```
messages/                 ar.json, fr.json (toutes les chaînes UI)
prisma/
  schema.prisma           User, Patient, Doctor, Consultation, Prescription,
                          Attachment, PatientLinkToken, ClaimCode, Notification, AuditLog,
                          AccessGrant (portée VITALS/FULL, TTL, révocation)
  migrations/             migrations initiale et access_grants
  seed.ts                 données de démonstration
public/                   logo, icônes PWA, manifest
src/
  app/[locale]/
    (auth)/               connexion, inscription
    patient/              dashboard, consultations, QR (choix de portée), access, claim, profil
    doctor/               dashboard, consultations (new, edit, detail, finish), patients (dossiers), profil
    notifications/        centre de notifications
    dev/ui/               vitrine du design system (hors production)
  app/api/                auth, patient, doctor, patients, access-grants, notifications, fichiers
  components/
    ui/                   boutons, badges, champs, dialogue, QR, etc.
    shared/               shell, sidebar, topbar, cartes, listes
    doctor/               formulaire de consultation
  lib/                    prisma, auth, tokens, rate-limit, audit, stockage, utils
  i18n/                   configuration next-intl
  middleware.ts           locale + garde de rôle
tests/                    tests Vitest (jetons, scan, rate-limit, utils, grants)
uploads/                  stockage local des pièces jointes (seed/ inclus)
```

---

## Scripts

| Commande | Description |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | `prisma generate` + build Next.js |
| `npm run start` | Serveur de production |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Migration de développement |
| `npm run db:deploy` | Applique les migrations |
| `npm run db:seed` | Données de démonstration |
| `npm run db:studio` | Prisma Studio |
| `npm test` | Tests Vitest |

---

## Export PDF

Le cahier des charges mentionnait `@react-pdf/renderer`. L’export est finalement réalisé par **impression navigateur** (`window.print()` sur une mise en page dédiée), avec enregistrement en PDF depuis la boîte d’impression.

Raison : la mise en page arabe (ligatures, sens de lecture, shaping) est nettement plus fiable avec le moteur du navigateur qu’avec les polices embarquées de `@react-pdf/renderer`. Le résultat reste un PDF de qualité, et l’impression fonctionne aussi pour les codes de remise.

Les styles d’impression sont définis dans `src/app/globals.css` (`.no-print`, `.print-card`, `.print-area`).

---

## Tests

```bash
npm test
```

Couverture actuelle :

- formatage et normalisation des codes ;
- hachage SHA-256 ;
- génération des jetons patient (5 min) et des codes de remise (72 h) ;
- lecture des payloads QR (`sehhati://link?t=…`, `sehhati://claim?c=…`, liens HTTPS) ;
- rejet des valeurs malformées ;
- expiration ;
- limitation de débit (seuil par minute, blocage 15 min après 10 échecs, clés indépendantes) ;
- masquage des noms, initiales, pluriels, calcul de countdown ;
- grants d’accès (`AccessGrant`) : portée active non expirée/non révoquée, ordre `LINK_ONLY < VITALS < FULL`.

---

## Limites connues

- Limitation de débit en mémoire : à remplacer par Redis/Upstash pour un déploiement multi-instances.
- Stockage local des fichiers : à remplacer par S3/R2 avec URLs signées en production.
- Pas de vérification d’e-mail, de réinitialisation de mot de passe ni de gestion administrative (hors périmètre).
- Le QR du patient est régénéré à l’ouverture de la page « Mon QR » : les codes étant hachés, un code existant ne peut pas être réaffiché.
- Les notifications sont internes à l’application (pas d’e-mail/SMS).
- L’interface de démonstration `/fr/dev/ui` (et `/ar/dev/ui`) n’est accessible que hors production (`NODE_ENV=development`) ; en production elle redirige vers le tableau de bord.

---

## CNDP et loi 09-08

Les données de santé sont des données sensibles au sens de la loi 09-08 relative à la protection des personnes physiques à l’égard du traitement des données à caractère personnel.

Avant tout usage réel :

- déclarer le traitement auprès de la **CNDP** ;
- définir une base légale, une durée de conservation et une politique de suppression ;
- recueillir un consentement explicite et documenté ;
- chiffrer les données au repos et en transit ;
- limiter les accès au strict nécessaire (principe de minimisation) ;
- prévoir les droits d’accès, de rectification et d’opposition ;
- réaliser une analyse d’impact (AIPD) si nécessaire.

Ce projet est une démonstration technique et ne constitue pas un dispositif médical ni un service certifié.
