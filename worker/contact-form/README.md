# The contact form's mail service

The website is static — a folder of files on GitHub Pages with nothing running
behind it. That is why the form used to hand inquiries to the visitor's own
email program: there was no server to send them.

This is that server. It is about a hundred lines, it runs free on Cloudflare
Workers, and its only job is to take a form post from the website and hand it
to Resend, which delivers the email.

**The reason it exists at all is the API key.** Everything the browser
downloads is public — anyone can open View Source. A Resend key in `app.js`
would be a key anyone could copy, and anyone holding it could send email
claiming to be Nichols Land until it was revoked. The key lives on Cloudflare
instead, and only this Worker ever sees it.

---

## What you'll need open

- The Cloudflare account — the same one the listings admin uses (see
  `admin/SETUP.md`). It should be owned by Nichols, not by a contractor.
- The Resend dashboard, <https://resend.com>.
- The API key. **Treat it like a password.** If it has been pasted into a chat,
  an email, or a document, delete that key in Resend and issue a fresh one —
  it takes ten seconds and there is no downside.

Budget fifteen minutes.

---

## 1. Create the Worker

1. In the Cloudflare dashboard: **Workers & Pages → Create → Start with Hello
   World → Deploy**. Name it `nichols-contact-form`.
2. Click **Edit code**.
3. Delete everything in the editor, paste in the whole of
   [`src/index.js`](src/index.js) from this folder, and **Deploy**.

Cloudflare shows you a URL like
`https://nichols-contact-form.something.workers.dev`. **Copy it — step 3 needs
it.**

> Prefer the command line? From this folder: `npx wrangler login`, then
> `npx wrangler secret put RESEND_API_KEY`, then `npx wrangler deploy`. That
> reads `wrangler.toml` and does steps 1 and 2 together.

---

## 2. Give the Worker its settings

**Settings → Variables and Secrets**, on the Worker you just made.

| Name | Type | Value |
| --- | --- | --- |
| `RESEND_API_KEY` | **Secret** | the key from <https://resend.com/api-keys> |
| `TO_EMAIL` | Text | `gwilliams@nicholsland.net` |
| `FROM_EMAIL` | Text | `Nichols Land Website <onboarding@resend.dev>` — until step 5 |
| `ALLOWED_ORIGINS` | Text | `https://cohen05heidt.github.io` |
| `CC_EMAIL` | Text | *optional* — more recipients, comma-separated |

`RESEND_API_KEY` must be added with the **Secret** / **Encrypt** option, not as
plain text. A plain-text variable is visible to everyone with dashboard access
and readable forever after; a secret is write-only once saved.

`ALLOWED_ORIGINS` is what stops the Worker being a free anonymous mailer for
anyone who finds its URL. A post from anywhere not on that list is refused.
Add the real domain to it, comma-separated, when the site moves off
`github.io`.

**Save and deploy** after adding them — variables don't take effect until the
Worker redeploys.

---

## 3. Point the website at it

In `index.html`, find the contact form and paste the Worker URL:

```html
<form class="form-grid" data-contact-form novalidate
      data-endpoint="https://nichols-contact-form.something.workers.dev"
      data-fallback-email="gwilliams@nicholsland.net">
```

That is the only change on the website side. Commit it and the form is live a
minute later.

Leave `data-fallback-email` alone. If the Worker is ever unreachable the form
falls back to opening the visitor's email program with everything filled in —
worse than a real send, but it means an inquiry is never confirmed on screen
and then quietly lost.

---

## 4. Test it

Open the live site, fill in the form, send. Within a few seconds the message
should arrive at `TO_EMAIL`, and **Reply** in that email should address the
person who filled in the form, not Resend.

If it doesn't arrive:

- **Resend → Emails** shows every attempt and why any of them failed. This is
  almost always where the answer is.
- Cloudflare → the Worker → **Logs** shows what the Worker saw. Errors from
  Resend are logged in full here but deliberately never returned to the
  browser — they quote the sending domain and the key, and neither belongs in
  something a visitor can read.
- A `403` in the browser console means the site's origin isn't in
  `ALLOWED_ORIGINS`.

---

## 5. Send from nicholsland.net instead of resend.dev

Until a domain is verified, Resend will only deliver to the address that owns
the Resend account. That is fine for testing and useless in production.

**This does not require moving the website.** Verifying a sending domain adds
DNS records; it does not touch where `nicholsland.net` points. The current
WordPress site keeps working exactly as it does now.

1. **Resend → Domains → Add Domain**, enter `nicholsland.net`.
2. Resend shows three or four DNS records — a `TXT` for DKIM, an `MX` and a
   `TXT` for the return path, and usually a DMARC `TXT`.
3. Add them wherever `nicholsland.net`'s DNS is managed today — whoever hosts
   the current WordPress site, or the registrar. Copy the values exactly.
4. Back in Resend, click **Verify**. It usually goes green in minutes; DNS can
   take up to a day.
5. Then change `FROM_EMAIL` on the Worker to
   `Nichols Land Website <website@nicholsland.net>` and redeploy.

`website@nicholsland.net` does not need to be a real mailbox — it is a sending
address only. Replies go to the visitor anyway, via Reply-To.

**One caution on the MX record.** If Resend asks for an `MX` on the root domain
rather than a subdomain, adding it can interfere with the company's existing
email. Verify a subdomain instead — enter `send.nicholsland.net` in step 1 — and
the records sit safely off to one side. Mail still appears to come from Nichols
Land; only the technical sending domain differs.

---

## Files here

| | |
| --- | --- |
| `src/index.js` | the Worker. This is the thing that gets deployed. |
| `wrangler.toml` | settings for command-line deploys. **No key in it, ever.** |

`wrangler.toml` is committed to a public repository. Anything written into it
is public. That is why `RESEND_API_KEY` is set with `wrangler secret put`
rather than listed under `[vars]`.
