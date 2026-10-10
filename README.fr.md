# HelpDesk Notion (version gratuite) : guide d'installation

*[English version](README.md)*

HelpDesk Notion par Marcan et Co. transforme chaque courriel reçu à votre adresse de support en Ticket dans Notion. Ce guide met en place la version gratuite en une quinzaine de minutes.

Le modèle Notion et n8n sont en anglais : les noms de propriétés, de nœuds et de boutons sont donc cités tels qu'ils apparaissent à l'écran.

## Ce qu'il vous faut

- Une instance n8n : n8n Cloud ou auto-hébergée, version récente (testé sur n8n 2.41).
- Un espace de travail Notion où vous pouvez ajouter une intégration.
- Une boîte de support que n8n peut lire en IMAP : Gmail, Google Workspace, Zoho Mail ou un hébergeur cPanel typique. Microsoft 365 n'est pas pris en charge, car Microsoft a désactivé la connexion IMAP par mot de passe.

## 1. Dupliquer le modèle Notion

1. Ouvrez le [modèle HelpDesk Notion](https://marcanetco.notion.site/Notion-HelpDesk-3ea524fadb0d80619080e48a163b2cf1) et cliquez sur **Dupliquer** (**Duplicate**), en haut à droite. Choisissez l'espace de travail de votre help desk.
2. La copie contient une base **Tickets**, une base **Contacts** et une page **Settings**. Gardez-les ensemble sous la même page.

Ne renommez pas les propriétés des bases : le workflow les retrouve par leur nom. Dans la base Tickets, **New** doit rester l'option de Status par défaut, puisque les nouveaux Tickets reçoivent la valeur par défaut. Vous pouvez changer la mise en page du corps des Tickets en modifiant le modèle par défaut de la base Tickets (`New` ▾ → `•••` du modèle). Le courriel s'insère au-dessus.

## 2. Créer l'intégration Notion

1. Dans l'espace de travail qui contient votre copie, allez sur [app.notion.com/developers/connections](https://app.notion.com/developers/connections) (**Developer tools** → **Connections**) → **New connection**. Donnez-lui un nom (par exemple « Notion HelpDesk »), choisissez la méthode d'authentification **API token** (pas **OAuth**) et cliquez sur **Create connection**.
2. Dans **Capabilities**, gardez **Read content**, **Update content** et **Insert content**, et activez **Read comments** et **Insert comments** : les suivis sont ajoutés en commentaires, et la version payante lit les commentaires.
3. Sous **Integration token**, copiez l'**API token** (icône de copie à droite du champ). Vous le collerez dans n8n à l'étape 5.
4. De retour dans Notion, ouvrez la page qui contient votre copie → `•••` → **Connexions** (**Connections**) → ajoutez votre intégration. Cette page et ses sous-pages héritent de l'accès.

## 3. Copier les identifiants des bases

Ouvrez la base **Tickets** en pleine page et copiez son lien (`•••` → **Copier le lien**). L'identifiant, ce sont les 32 caractères avant `?v=` :

```
https://www.notion.so/votreespace/1f2e3d4c5b6a79881f2e3d4c5b6a7988?v=…
                                  └─── identifiant de la base ─────┘
```

Faites de même pour **Contacts**. Vous collerez les deux identifiants à l'étape 5.

## 4. Obtenir vos accès IMAP

### Gmail et Google Workspace : mot de passe d'application

n8n se connecte à Gmail avec un **mot de passe d'application**, pas avec votre mot de passe habituel.

1. Activez la validation en deux étapes du compte de support si ce n'est pas déjà fait ([myaccount.google.com/security](https://myaccount.google.com/security)).
2. Créez un mot de passe d'application sur [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), nommé par exemple « n8n HelpDesk ». Copiez les 16 caractères sans les espaces.

Les mots de passe d'application ne sont pas offerts quand le compte se connecte uniquement avec des clés de sécurité ou utilise la Protection avancée, et un administrateur Google Workspace peut les désactiver pour l'organisation. Dans ces cas, adressez-vous à votre administrateur ou utilisez une autre boîte de support.

| | Gmail / Google Workspace | Zoho Mail | Hébergeur cPanel |
|---|---|---|---|
| Serveur IMAP | `imap.gmail.com` | `imap.zoho.com` (comptes d'organisation : `imappro.zoho.com`) | habituellement `mail.votredomaine.com` |
| Port IMAP | 993, SSL/TLS | 993, SSL/TLS | 993, SSL/TLS |
| Utilisateur | l'adresse de support complète | l'adresse de support complète | l'adresse de support complète |
| Mot de passe | le mot de passe d'application | votre mot de passe, ou un mot de passe propre à l'application si la 2FA est active | le mot de passe de la boîte |

La version gratuite ne fait que lire les courriels. La version payante envoie aussi en SMTP avec le même utilisateur et le même mot de passe (Gmail : `smtp.gmail.com`, port 465 avec SSL/TLS, ou port 587 sans SSL/TLS si le 465 expire) : gardez ces informations sous la main.

### Vérifier l'adressage plus

Depuis une autre adresse, écrivez à votre adresse de support avec `+test` avant le `@`, par exemple `support+test@votredomaine.com`. Le courriel doit arriver dans la boîte de support. Gmail et Google Workspace le permettent d'emblée. S'il est refusé ou n'arrive jamais, cherchez « plus addressing » ou « sous-adressage » dans l'aide de votre fournisseur et activez-le. La version gratuite fonctionne sans, mais la version payante s'en sert pour rattacher les réponses à leur Ticket.

## 5. Importer et configurer le workflow

1. Dans n8n, importez le workflow : depuis la bibliothèque de templates n8n, **Use workflow** ; depuis un fichier, créez un workflow, puis `•••` (en haut à droite) → **Import from File…** → [`inbound.json`](https://github.com/marcanetco/notion-helpdesk-free/releases/latest/download/inbound.json).
2. Ouvrez **Email received** → **Credential** → **Create new credential** (IMAP) et remplissez-le avec les informations de l'étape 4.
3. Ouvrez **Find Ticket**, créez un accès **Notion API** dans son champ de credential et collez-y l'API token de l'étape 2. Choisissez ensuite ce même accès dans chacun des autres nœuds HTTP Request (12 en tout). Si c'est votre seul accès Notion, n8n l'aura déjà sélectionné.
4. Ouvrez **Settings** et remplacez `PASTE_TICKETS_DATABASE_ID` et `PASTE_CONTACTS_DATABASE_ID` par les identifiants de l'étape 3.
5. Enregistrez.

## 6. Tester, puis publier

1. Cliquez sur **Execute workflow**, puis écrivez à votre adresse de support depuis une autre adresse. Habituellement en quelques secondes, un Ticket apparaît dans Notion, avec le courriel comme contenu et vous comme Requester.
2. Testez un suivi. Cliquez de nouveau sur **Execute workflow**, car en mode test chaque clic ne traite qu'un courriel. Depuis l'adresse de l'étape 1, ouvrez le courriel envoyé (dans vos **Éléments envoyés**) et faites **Répondre**. Au lieu de créer un nouveau Ticket, ce suivi s'ajoute en commentaire au Ticket de l'étape 1.
3. Avant de publier, marquez comme lus les anciens courriels de la boîte de support qui ne doivent pas devenir des Tickets : le workflow ramasse les courriels non lus.
4. Publiez (activez) le workflow. Il reste connecté à la boîte et ramasse chaque nouveau courriel dès son arrivée.

Si une exécution échoue, corrigez la cause et relancez-la depuis **Executions** : un courriel déjà sur un Ticket est ignoré, donc une relance ne crée jamais de doublon.

## Aide

La version gratuite n'inclut pas de soutien direct. Pour vos questions, écrivez sur le [forum de la communauté n8n](https://community.n8n.io).

## Envie d'aller plus loin ?

La [version payante](https://marcan.co/helpdesk-notion/installation-cle-en-main/) ajoute les réponses envoyées depuis les commentaires Notion, les changements de Status avec un courriel de fermeture, la gestion des CC et des courriels transférés, et les alertes d'erreur. Elle utilise le même modèle Notion : passer à la version payante ne déplace aucune donnée. [Inscrivez-vous à la liste d'attente](https://marcan.co/helpdesk-notion/installation-cle-en-main/#liste-attente) pour savoir quand elle sera prête.

Vous préférez qu'on s'en occupe ? Avec l'[installation clé en main](https://marcan.co/helpdesk-notion/installation-cle-en-main/#installation-cle-en-main) par Marcan et Co., nous mettons en place la version payante dans votre propre n8n et votre propre Notion, la testons avec vous et formons brièvement votre équipe.

---

HelpDesk Notion, version gratuite, © 2026 [Marcan et Co.](https://marcan.co), publiée sous licence MIT.
