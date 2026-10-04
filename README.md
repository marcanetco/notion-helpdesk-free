# Notion HelpDesk (Free tier): setup guide

*[Version française](README.fr.md)*

> This repo is generated from the Notion HelpDesk source and updated with each release: it isn't edited here and doesn't take issues or pull requests. The up-to-date setup guide is at [marcan.co/notion-helpdesk](https://marcan.co/notion-helpdesk/), and questions go to the [n8n community forum](https://community.n8n.io).

Notion HelpDesk by Marcan et Co. turns every email to your support address into a Ticket in Notion. This guide sets up the Free tier in about 15 minutes.

## What you need

- An n8n instance: n8n Cloud or self-hosted, recent version (tested on n8n 2.41).
- A Notion workspace where you can add an integration.
- A support mailbox that n8n can read over IMAP: Gmail, Google Workspace, Zoho Mail or a typical cPanel host. Microsoft 365 isn't supported, because Microsoft has turned off password sign-in for IMAP.

## 1. Duplicate the Notion template

1. Open the [Notion HelpDesk template](https://marcanetco.notion.site/Notion-HelpDesk-3ea524fadb0d80619080e48a163b2cf1) and click **Duplicate**, top right. Pick the workspace for your help desk.
2. The copy holds a **Tickets** database, a **Contacts** database and a **Settings** page. Keep them together under the same page.

Don't rename the database properties: the workflow finds them by name. In the Tickets database, **New** must stay the default Status option, since new Tickets get the default. You can change the Ticket body's layout: edit the Tickets database's default template (`New` ▾ → the template's `•••`). The email goes above it.

## 2. Create the Notion integration

1. Go to [notion.so/profile/integrations](https://www.notion.so/profile/integrations) → **New integration**. Type **Internal**, workspace: the one holding your copy.
2. In **Capabilities**, keep **Read content**, **Update content** and **Insert content**, and turn on **Insert comments** (follow-ups are added as comments). Save.
3. Copy the **Internal Integration Secret**. You'll paste it into n8n in step 5.
4. Back in Notion, open the page that holds your copy → `•••` → **Connections** → add your integration. Both databases inherit the access.

## 3. Copy the database ids

Open the **Tickets** database as a full page and copy its link (`•••` → **Copy link**). The id is the 32 characters before `?v=`:

```
https://www.notion.so/yourspace/1f2e3d4c5b6a79881f2e3d4c5b6a7988?v=…
                                └──────────── database id ─────┘
```

Do the same for **Contacts**. You'll paste both ids in step 5.

## 4. Get your IMAP credentials

### Gmail and Google Workspace: app password

n8n signs in to Gmail with an **app password**, not your regular password.

1. Turn on 2-Step Verification for the support account if it isn't on yet ([myaccount.google.com/security](https://myaccount.google.com/security)).
2. Create an app password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), named for example "n8n HelpDesk". Copy the 16 characters without the spaces.

App passwords aren't available when the account signs in with security keys only or uses Advanced Protection, and a Google Workspace admin can turn them off for the organization. In those cases, ask your admin or use a different support mailbox.

| | Gmail / Google Workspace | Zoho Mail | cPanel host |
|---|---|---|---|
| IMAP host | `imap.gmail.com` | `imap.zoho.com` (organization accounts: `imappro.zoho.com`) | usually `mail.yourdomain.com` |
| IMAP port | 993, SSL/TLS | 993, SSL/TLS | 993, SSL/TLS |
| User | the full support address | the full support address | the full support address |
| Password | the app password | your password, or an app-specific password if 2FA is on | the mailbox password |

The Free tier only reads mail. The Paid tier also sends over SMTP with the same user and password (Gmail: `smtp.gmail.com`, port 465 with SSL/TLS, or port 587 with SSL/TLS off if 465 times out), so keep these details at hand.

### Check plus-addressing

Send an email from another address to your support address with `+test` before the `@`, for example `support+test@yourdomain.com`. It should land in the support inbox. Gmail and Google Workspace support this out of the box. If it bounces or never arrives, look for "plus addressing" or "subaddressing" in your provider's help and turn it on. The Free tier works without it, but the Paid tier relies on it to match replies to their Ticket.

## 5. Import and configure the workflow

1. In n8n, import the workflow: from the n8n template library, **Use workflow**; from a file, create a workflow, then `•••` (top right) → **Import from File…** → [`inbound.json`](https://github.com/marcanetco/notion-helpdesk-free/releases/latest/download/inbound.json).
2. Open **Email received** → **Credential** → **Create new credential** (IMAP) and fill in the details from step 4.
3. Open **Find Ticket**, create a **Notion API** credential in its credential field and paste the integration secret from step 2. Then pick the same credential in every other HTTP Request node (12 in all). If it's your only Notion credential, n8n may have selected it already.
4. Open **Settings** and replace `PASTE_TICKETS_DATABASE_ID` and `PASTE_CONTACTS_DATABASE_ID` with the ids from step 3.
5. Save.

## 6. Test, then publish

1. Click **Execute workflow**, then send an email to your support address from another address. Usually within seconds, a Ticket appears in Notion with the email as its body and you as its Requester.
2. Click **Execute workflow** again and reply to that email from the address you sent it from, in the same thread: the reply is added to the same Ticket as a comment.
3. Before you publish, mark as read any old emails in the support inbox that shouldn't become Tickets: the workflow picks up unread emails.
4. Publish (activate) the workflow. It stays connected to the inbox and picks up each new email as it arrives.

If an execution fails, fix the cause and retry it from **Executions**: an email already on a Ticket is skipped, so a retry never creates a duplicate.

## Help

The Free tier comes without direct support. For questions, post on the [n8n community forum](https://community.n8n.io).

## Want more?

The [Paid tier](https://marcan.co/notion-helpdesk/setup-service/) adds replies sent from Notion comments, Status changes with a Closing email, CC and forwarded-email handling, and error alerts. It uses the same Notion template, so upgrading doesn't move any data. [Join the waitlist](https://marcan.co/notion-helpdesk/setup-service/#waitlist) to hear when it's out.

Rather have it done for you? With the [Setup service](https://marcan.co/notion-helpdesk/setup-service/#setup-service) by Marcan et Co., we set up the Paid tier in your own n8n and Notion, test it with you and give your team a short training.

---

Notion HelpDesk Free tier, © 2026 [Marcan et Co.](https://marcan.co), released under the MIT license.
