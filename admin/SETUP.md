# Turning on the "Sign in with GitHub" button

The listings admin lives at
**https://cohen05heidt.github.io/NicholsLandWebsite/admin/**

It talks to this repository directly from the browser, which means signing in to
the admin *is* signing in to GitHub. Out of the box that happens by pasting a
personal access token — fine for testing, fiddly for anyone else. The steps
below replace it with an ordinary **Sign in with GitHub** button.

You only do this once. Budget fifteen minutes.

---

## Before you start

Everyone who will add or remove listings needs:

1. A free GitHub account.
2. Write access to this repository — *Settings → Collaborators → Add people*,
   with the **Write** role. Write is enough; don't grant Admin.

That is the whole permission model. Removing someone's access removes their
ability to change the site, immediately.

---

## 1. Deploy the authenticator

Sveltia publishes a small open-source service whose only job is to complete the
GitHub login handshake, because a site with no server of its own can't hold an
OAuth secret. It runs free on Cloudflare Workers.

1. Sign in (or sign up) at <https://dash.cloudflare.com> — the free plan is
   plenty.
2. Go to <https://github.com/sveltia/sveltia-cms-auth> and use the
   **Deploy to Cloudflare Workers** button in the README.
3. When it finishes, copy the Worker URL. It looks like
   `https://sveltia-cms-auth.<your-subdomain>.workers.dev`.

Keep that URL — the next two steps both need it.

---

## 2. Register the GitHub OAuth app

Go to <https://github.com/settings/applications/new> and fill in:

| Field | Value |
| --- | --- |
| Application name | `Nichols Land Listings Admin` |
| Homepage URL | `https://cohen05heidt.github.io/NicholsLandWebsite/` |
| Authorization callback URL | `<YOUR WORKER URL>/callback` |

The callback URL must be the Worker URL from step 1 with `/callback` on the end.
Getting this wrong is the single most common cause of a login that spins and
then fails.

Register it, then **Generate a new client secret**. You now have a **Client ID**
and a **Client Secret**. The secret is shown once — copy it now.

---

## 3. Give the Worker the credentials

Back in the Cloudflare dashboard, open the `sveltia-cms-auth` Worker →
**Settings → Variables and Secrets**, and add:

| Name | Value |
| --- | --- |
| `GITHUB_CLIENT_ID` | the Client ID from step 2 |
| `GITHUB_CLIENT_SECRET` | the Client Secret from step 2 — mark it **Encrypt** |
| `ALLOWED_DOMAINS` | `cohen05heidt.github.io` |

`ALLOWED_DOMAINS` is what stops anyone else pointing their own CMS at your
authenticator. Save and deploy.

---

## 4. Point the admin at it

In this repository, edit **`admin/config.yml`**. Near the top, under `backend:`,
there is a commented-out line. Uncomment it and paste in your Worker URL:

```yaml
backend:
  name: github
  repo: cohen05heidt/NicholsLandWebsite
  branch: main
  base_url: https://sveltia-cms-auth.your-subdomain.workers.dev
```

Commit that change. A minute later the admin page shows a **Sign in with
GitHub** button, and nobody needs a token again.

---

## Checking it worked

Open the admin in a private window, sign in, change something small on a test
listing, and save. Within about a minute:

- The **Actions** tab shows *Build properties.json* running, and going green.
- A commit appears from `github-actions[bot]` rebuilding `data/properties.json`.
- The change is visible on the live site.

If the Action goes red, open it and read the last step. The build script names
the file and the field it objected to, and the live site keeps serving the last
good version until it's fixed — a bad listing can't take tracts off the site.

---

## Until then: signing in with a token

The admin works right now without any of the above. On the sign-in screen choose
**Sign In with Token**, follow the link GitHub offers, and create a fine-grained
personal access token with **Contents: read and write** on this repository only.
Paste it in once; the browser remembers it. It's the same access, just a clumsier
door.

---

## How the pieces fit

```
admin/                 the CMS page and its form configuration
data/properties/       one JSON file per tract — what the CMS writes
tools/                 the script that joins them into one array
data/properties.json   generated; do not hand-edit
```

`data/properties.json` is a build artefact. Editing it directly works right up
until the next listing is saved, at which point it is overwritten. Change tracts
through the admin, or by editing the files in `data/properties/`.
