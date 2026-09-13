# Go-live checklist

Four things stand between the site as it is now and the site running on its own
domain, sending its own mail, and being maintained by Nichols rather than by
you. They are independent — do them in any order — but the first one is urgent
and takes a minute.

---

## 1. Rotate the Resend API key — do this first

The key that was used to build the contact form has been pasted into a chat
window. Assume it is compromised, because a key that has left the dashboard
once cannot be un-left.

1. <https://resend.com/api-keys> → delete the existing key.
2. **Create API Key**. Name it `nichols-website-form`. Permission: **Sending
   access** only — it never needs to read anything or manage domains.
3. Put the new key straight into the Cloudflare Worker as a **secret**
   (`worker/contact-form/README.md`, step 2). Don't email it, don't paste it
   into a document, and don't put it in this repository.

The repository is public. Anything committed to it is readable by anyone, and
stays in the git history even after it is deleted.

---

## 2. Turn the contact form on

Full instructions: **`worker/contact-form/README.md`**.

The short version: deploy the Worker to Cloudflare, give it the Resend key as a
secret, and paste the Worker's URL into `data-endpoint` on the form in
`index.html`. About fifteen minutes.

Until that endpoint is set, the form still works — it opens the visitor's own
email program with everything filled in. Nothing is lost in the meantime; it
just isn't as good.

**Inquiries go to `gwilliams@nicholsland.net`**, with Reply-To set to whoever
filled in the form, so replying from the inbox reaches them directly.

---

## 3. Hand the listings over to Nichols

Full instructions: **`admin/SETUP.md`**. What to forward to the client:
**`admin/FOR-NICHOLS.md`**.

The admin already exists at `/admin`. It can add a tract, edit one, mark one
Under Contract or Sold, and delete one — and every change appears on the site
about a minute later with nobody to notify. What it is missing is a **Sign in
with GitHub** button; right now it asks for a personal access token, which is
fine for you and not something to hand a client.

Three things, all free, none of them long:

1. **Deploy the `sveltia-cms-auth` Worker** to the same Cloudflare account as
   the form Worker, and register a GitHub OAuth app pointing at it.
   `admin/SETUP.md` steps 2–4 are click-by-click.
2. **Paste its URL into `admin/config.yml`** — there is a single commented-out
   `base_url:` line near the top marked as the one line to fill in.
3. **Invite the client's GitHub username as a collaborator** with the **Write**
   role. *Nothing works without this.* OAuth controls how someone signs in; it
   grants nothing on its own, and the repository currently has no
   collaborators.

Once that's done, marking a tract sold is: open `/admin`, click the tract,
change **Status** to **Sold**, save. There is a **Sold** filter on the listing
screen so finding one takes a click rather than a scroll.

---

## 4. Move nicholsland.net onto this site

This is the one with real risk attached, because `nicholsland.net` currently
serves the live WordPress site. Changing its DNS takes that site down at the
moment the change propagates. So don't cut over blind — prove it on a
subdomain first.

### First: check the site on a subdomain

1. In this repository: **Settings → Pages → Custom domain**, enter
   `new.nicholsland.net`, save. That writes a `CNAME` file to the repo.
2. Wherever `nicholsland.net`'s DNS is managed, add one record:

   | Type | Name | Value |
   | --- | --- | --- |
   | `CNAME` | `new` | `cohen05heidt.github.io` |

3. Wait for it to resolve, then tick **Enforce HTTPS** in Settings → Pages.

The live site is untouched by this — you have added a subdomain, not moved
anything. Send `https://new.nicholsland.net` to the client and let them click
through every page, on a phone as well as a laptop.

### Then: the cutover

When they've signed off, change the custom domain in Settings → Pages to
`www.nicholsland.net` and replace the DNS records:

| Type | Name | Value |
| --- | --- | --- |
| `CNAME` | `www` | `cohen05heidt.github.io` |
| `A` | `@` | `185.199.108.153` |
| `A` | `@` | `185.199.109.153` |
| `A` | `@` | `185.199.110.153` |
| `A` | `@` | `185.199.111.153` |

The four `A` records are GitHub's Pages servers; all four, so the root domain
survives one of them being down. They replace whatever `@` points at today —
**note the old values down before you delete them**, because they are the only
way back to WordPress in a hurry.

Then:

- Tick **Enforce HTTPS**. The certificate can take up to an hour; until it
  issues, visitors get a browser warning, so don't do this on a Friday
  afternoon.
- Add `https://www.nicholsland.net,https://nicholsland.net` to the form
  Worker's `ALLOWED_ORIGINS` and redeploy, or the contact form starts returning
  403 the moment the domain changes.
- Update `ALLOWED_DOMAINS` on the `sveltia-cms-auth` Worker the same way, or
  the admin login stops working.
- In the GitHub OAuth app, update the Homepage URL.

Those last three are the classic day-after-launch bugs: the site looks perfect
and the form and the admin both quietly stop working, because both are
origin-locked to `cohen05heidt.github.io`.

### Two things worth knowing before you start

**Email is not affected — as long as you leave `MX` alone.** The company's
email runs on `MX` records; the website runs on `A` and `CNAME`. Changing the
second does not touch the first. The one way to break email here is to add or
replace an `MX` record while verifying the Resend sending domain, which is why
`worker/contact-form/README.md` suggests verifying `send.nicholsland.net`
rather than the root domain.

**The old site's URLs will 404.** Anything indexed by Google under
`nicholsland.net/property/...` stops existing. That is survivable for a site
this size, but worth listing the top handful of old URLs and deciding where
each should land before the cutover rather than after.

---

## What was added in this round

| | |
| --- | --- |
| `data/properties/ferrell-carter-road.json` | the 181± acre Jeff Davis County tract |
| `worker/contact-form/` | the Worker, its settings, and its deploy guide |
| `index.html`, `assets/js/app.js` | form wired to the Worker, plus two bot traps |
| `admin/config.yml` | status filters, clearer sign-in instructions |

### One thing still outstanding on the new listing

Its **17 photos are hotlinked from land.com**, not hosted on this site. They
are the right photos — each one was checked against the listing before it went
in, and two images that turned out to belong to a different property (a house,
and a locator map) were left out — but two things are worth knowing:

- They are only about 640px wide, because that is all land.com serves. Fine in
  the grid and the map popup; visibly soft as the full-width header image.
- They load from land.com's servers. If that listing comes down, or land.com
  starts blocking other sites from using its images, the photos disappear from
  this site with no warning and nothing in the repository to explain why.

Get the originals from Garrett — he supplied them to land.com, so he has them
at full resolution — and upload them through `/admin`: open the tract, replace
what's under **Photos**, save. That hosts them here and fixes both problems at
once. The first photo in the list is the one used on cards, the map popup and
the listing header.
