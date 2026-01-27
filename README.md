# Fondation François Meye - Site Web et API

Site web de la Fondation François Meye avec système de dons, adhésions et boutique en ligne intégré avec le paiement Singpay.

## Architecture

```
FFME/
├── client/          # Frontend Angular
├── server/          # Backend Express + MongoDB
└── common/          # Interfaces et enums partagés
```

## Technologies

| Composant | Technologies |
|-----------|--------------|
| **Frontend** | Angular 17+, TypeScript, SCSS |
| **Backend** | Node.js, Express, TypeScript, TypeDI |
| **Base de données** | MongoDB, Mongoose |
| **Paiement** | Singpay Gateway |
| **Email** | Service de mail intégré |

## Installation

### Prérequis

- Node.js 18+
- MongoDB
- npm ou pnpm

### Installation des dépendances

```bash
# Client
cd client
npm install

# Serveur
cd server
npm install
```

### Configuration

Créer un fichier `.env` dans le dossier `server/` :

```env
PORT=3000
DB_URL=mongodb://localhost:27017/ffme
JWT_SECRET=your-secret-key
MAIL_API_KEY=your-mail-api-key

# Singpay (ne pas modifier en production)
SINGPAY_CLIENT_ID=xxx
SINGPAY_CLIENT_SECRET=xxx
SINGPAY_WALLET_ID=xxx
SINGPAY_DISBURSEMENT_ID=xxx
```

## Lancement

```bash
# Terminal 1 - Backend
cd server
npm start
# Serveur disponible sur http://localhost:3000

# Terminal 2 - Frontend
cd client
npm start
# Site disponible sur http://localhost:4200
```

## Fonctionnalités principales

### Dons
- Formulaire de don avec montants prédéfinis ou personnalisés
- Paiement via Singpay ou RIB
- Email de confirmation automatique

### Adhésions
- Formulaire d'adhésion avec upload de documents
- Paiement via Singpay ou autres méthodes
- Validation admin requise

### Boutique
- Catalogue de produits
- Panier et commandes
- Paiement intégré

### Administration
- Dashboard avec statistiques
- Gestion des membres, dons et commandes
- Suivi des transactions en temps réel

## Système de paiement Singpay

### Flux de paiement

```
1. Utilisateur remplit formulaire
2. Redirection vers portail Singpay
3. Paiement effectué
4. Singpay redirige vers page succès/échec
5. Vérification du paiement via API
6. Finalisation (création en BDD + email)
```

### Webhooks

URL webhook à configurer dans Singpay :
```
Production : https://api.fondationfrancoismeye.ga/api/webhook/singpay
Local      : http://localhost:3000/api/webhook/singpay
```

### Service de réconciliation

Au démarrage du serveur, un service vérifie automatiquement les transactions en attente toutes les 5 minutes pour garantir qu'aucun paiement n'est perdu.

## API Endpoints

### Public

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/donation` | Créer un don |
| POST | `/api/donation/:id/singpay` | Initier paiement Singpay |
| GET | `/api/donation/payment/verify/:ref` | Vérifier paiement |
| POST | `/api/membership` | Créer une adhésion |
| POST | `/api/membership/:id/payment` | Initier paiement |
| GET | `/api/membership/payment/verify/:ref` | Vérifier paiement |

### Webhooks

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/webhook/singpay` | Réception webhook Singpay |
| GET | `/api/webhook/stats` | Statistiques transactions |
| GET | `/api/webhook/transactions` | Liste transactions |
| POST | `/api/webhook/reconcile` | Forcer réconciliation (admin) |

### Admin (authentification requise)

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/admin/login` | Connexion admin |
| GET | `/api/admin/stats` | Statistiques dashboard |
| GET | `/api/admin/members` | Liste des membres |
| GET | `/api/admin/donations` | Liste des dons |
| PATCH | `/api/admin/member/:id/status` | Modifier statut membre |
| PATCH | `/api/admin/donation/:id/status` | Modifier statut don |

## Structure des données

### Transaction

```typescript
interface Transaction {
    id: string;
    type: 'donation' | 'membership' | 'product';
    entityId: string;
    reference: string;
    amount: number;
    status: 'initiated' | 'pending' | 'completed' | 'failed' | 'timeout';
    paymentMethod: 'SINGPay' | 'RIB' | 'Paiement sur place';
    payerFirstName: string;
    payerLastName: string;
    payerPhone: string;
    payerEmail: string;
    singpayTransactionId?: string;
    singpayStatus?: string;
    initiatedAt: string;
    completedAt?: string;
}
```

### Donation

```typescript
interface Donation {
    idDonation: string;
    projectMotivation: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    amount: number;
    isPaid: 'Completed' | 'Waiting' | 'Failure';
    paymentMethod: 'SINGPay' | 'RIB';
    registrationDate: string;
}
```

### Member

```typescript
interface Member {
    idMember: string;
    typeMember: 'Individuel' | 'Association' | 'Entreprise';
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    amount: number;
    paymentStatus: 'Completed' | 'Waiting' | 'Failure';
    paymentMethod: 'SINGPay' | 'RIB' | 'Paiement sur place';
    isValidated: boolean;
    additionalDocuments: Document[];
    registrationDate: string;
}
```

## Déploiement

### Production

```bash
# Build client
cd client
npm run build

# Build serveur
cd server
npm run build
```

### Variables d'environnement production

```env
NODE_ENV=production
PORT=3000
DB_URL=mongodb://...
HOST_CLIENT_URL=https://fondationfrancoismeye.ga/
HOST_SERVER_URL=https://api.fondationfrancoismeye.ga/
```

## Documentation technique

Voir [DOCUMENTATION.md](./DOCUMENTATION.md) pour la documentation technique complète.

## Mémoire du projet

Voir [CLAUDE.md](./CLAUDE.md) pour l'historique des développements et les notes techniques.

## Licence

Projet privé - Fondation François Meye
