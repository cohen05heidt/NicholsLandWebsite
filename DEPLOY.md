# The site is live

**https://cohen05heidt.github.io/NicholsLandWebsite/**

That's the link to send clients. Free, permanent, HTTPS.

The repo is **[github.com/cohen05heidt/NicholsLandWebsite](https://github.com/cohen05heidt/NicholsLandWebsite)**, serving from `main` / `(root)` with a `.nojekyll` file. I uploaded every file through GitHub's web interface, so nothing is waiting on you.

Verified live after deployment:

- Home page loads styled, hero video autoplays
- Title block reads 1,470± acres / 17 tracts / 6 counties from the live data
- 8 featured tracts, 6 newest, all tracts on the home map
- County dropdown carries all 159 Georgia counties
- Google Maps embed renders
- Properties page lists all 17 tracts
- `properties.html#gene-smith-road` opens straight to that tract
- No horizontal scrolling

## Pushing changes later

Double-click **`claude-deploy.bat`** in the project folder. It stages everything,
commits, pushes, and writes what happened to `Claude outputs\deploy-log.txt`.
It asks nothing and closes on its own — check the log to confirm it worked.

`deploy.bat` does the same thing but prompts for a commit message and waits for
you to confirm. Use whichever you prefer.

By hand, from the project folder, it is the usual three:

```bash
git add -A
git commit -m "what changed"
git push
```

> An earlier version of this file said to run `git fetch origin` followed by
> `git reset --hard origin/main`, because the local and remote histories had
> been built separately and needed reconnecting. **That is done — do not run it
> now.** `reset --hard` throws away every uncommitted edit in the folder without
> asking. If the two ever diverge again, `git pull` first and only reach for
> `reset --hard` once you are certain there is nothing local worth keeping.

Pages redeploys in about a minute. If the terminal asks for a password, GitHub wants a [personal access token](https://github.com/settings/tokens) — account passwords over HTTPS stopped working in 2021.

## Later — the real domain

When it goes live properly, add the client's domain under the same Pages settings. GitHub issues the certificate automatically. Nothing in the site's code changes.

---

## Why this works without any build step

Every path in the site is relative — `assets/css/style.css`, not `/assets/css/style.css`. That matters because Pages serves project repos from a subpath (`/NicholsLandWebsite/`), and absolute paths would break. I checked; there are none.

There's also a `.nojekyll` file. Pages runs Jekyll by default, which silently skips anything beginning with an underscore. Nothing here does today, but that file removes the whole class of bug.

---

## Before you send the link — three things to know

**1. Images and video are hotlinked, not in the repo.**

Listing photos and PDF maps load from `nicholsland.net`. The hero video and its still load from Higgsfield's CDN. Everything displays correctly today, but:

- if the old site is taken down, the listing photos break
- the hero video sits on a CDN we don't control

Fine for a client preview. **Before launch**, download both sets into `assets/img/` and `assets/video/` and update the paths. There's a TODO comment on the video line in `index.html`.

**2. The contact form doesn't send anything yet.**

It validates properly and shows a success message, but the submission only reaches the browser console. If the client fills it in during the demo, nobody receives it. Either say so upfront, or wire up a handler first — Formspree is about ten minutes.

**3. Four listings have unconfirmed data.**

See `LISTINGS-AND-MLS.md`. Two prices show "Call for Price" that are public elsewhere, and one tract is advertised as available when it's under contract.

---

## Checking it works once it's live

- [ ] Hero video plays automatically, no long pause on a still
- [ ] **Properties** lists 17 tracts
- [ ] County → Oglethorpe narrows it to 9
- [ ] **Map** toggle shows pins; clicking one opens a popup
- [ ] Clicking a listing opens the detail panel; browser Back closes it
- [ ] `…/properties.html#gene-smith-road` opens straight to that property in a fresh tab
- [ ] Contact map shows the Athens office
- [ ] County dropdown lists all 159 Georgia counties
- [ ] On a phone: no sideways scrolling, menu opens, phone number is tappable

If the **Properties** map is blank but everything else works, something is blocking `unpkg.com` or `openstreetmap.org` — worth knowing before the client hits it.
