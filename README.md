# Nichols Land & Investment Co. — Website

A static site (HTML/CSS/vanilla JS) rebuilt from the content on nicholsland.net, with the feature set the client liked on neweraland.com: property search, filterable listings, detail pages with galleries and plats, an interactive map and a working inquiry form.

## Running it locally

The site loads listings from JSON via `fetch()`, so it **must be served over HTTP** — opening `index.html` straight from the file system will show an error message.

Open a terminal **in the project folder** (right-click an empty spot in it and
pick "Open in Terminal") and run:

```bash
python -m http.server 8080
```

Then open http://localhost:8080

Nothing in the project depends on where that folder lives, so it works from any
drive letter or path — the folder can be moved or copied to another computer as
a unit.

## Moving the project to another computer

Copy the **whole folder**, including the hidden `.git` directory. That single
folder is the entire project — there is nothing installed elsewhere, no database
and no absolute paths, so it runs from any drive letter.

Two things are easy to lose, and neither announces itself:

**1. The hidden `.git` folder.** It holds the entire history *and* your GitHub
deploy token at `.git/deploy-token.txt`. Windows hides it by default, so a
drag-and-drop copy with hidden files switched off silently leaves it behind —
you get the website but no history and no ability to push. Turn on
**View → Show → Hidden items** in Explorer and confirm `.git` came across.

**2. The token itself** is not in the repository and cannot be recovered from
GitHub. If it is lost, generate a new one at
<https://github.com/settings/tokens> and save it as `.git/deploy-token.txt`
with no trailing blank line. Nothing else needs changing — the credential
helper in `.git/config` finds it relative to the repo.

Install [Git for Windows](https://git-scm.com/download/win) on the new machine
if it isn't there. Then, **every time you plug the drive into a computer,
double-click `repo-check.bat` first.** It confirms git can use the folder, that
the token is present and still works, that nothing is uncommitted or unpushed,
and that the history is undamaged — then writes the answer to
`Claude outputs\repo-check.txt`. Run it again before unplugging, so nothing is
stranded on the machine you are walking away from.

### The routine, in one line each

| When | Do this |
|---|---|
| Plug the drive into a new PC | Double-click `enable-auto-deploy.bat` once |
| Change something | Ask Claude — it edits and deploys on its own |
| Publish by hand instead | Double-click `claude-deploy.bat`, or `deploy.bat` to type a message |
| Check on things | Double-click `repo-check.bat`, read the last line |

### Automatic deploying

A scheduled task, **NicholsLand Auto Deploy**, runs `auto-deploy.bat` once a
minute in the background with no visible window. It does nothing at all unless
it finds a signal file at `Claude outputs\deploy-now.txt`; when it does, it
claims that file, uses its contents as the commit message, and commits, pulls
and pushes. That gating is the point — the task can never publish a
half-finished edit that happens to be sitting in the folder, only work that has
been explicitly declared ready.

The result: Claude can write a change and publish it without anyone clicking
anything. Its record of each run is `Claude outputs\auto-deploy-log.txt`.

Setting up on another computer is `enable-auto-deploy.bat`, once. It has to be
re-run per machine because the path is baked in when it registers, and the
drive letter changes.

**Unplugging the drive needs no ceremony.** The task does not point at the
drive. It points at a small launcher written into `%LOCALAPPDATA%` on whichever
computer you set it up on, and that launcher checks the project folder is
actually present before doing anything. Pull the drive and it finds nothing and
exits without a sound; plug it back in and it resumes on the next minute. There
is nothing to switch off and nothing to remember.

`disable-auto-deploy.bat` is for retiring the automation for good, not for
unplugging. It deletes the task and its launcher; the website and its history
are untouched either way.

### Three things that are handled for you

**Line endings** are pinned by `.gitattributes`, so a second machine won't
report the whole project as modified the first time it opens it.

**"Dubious ownership."** Git refuses a repository whose folder belongs to a
different Windows account than the one running it — which is precisely what a
moved drive looks like. Both scripts detect this and trust the folder for the
current user, so the error never reaches you.

**GitHub moving on its own.** The Actions workflow rebuilds
`data/properties.json` whenever a listing changes, and the `/admin` CMS commits
straight to the remote. Either can leave GitHub ahead of this folder while it
sits in a drawer. Both scripts now pull before they push, so that resolves
itself instead of failing with "non-fast-forward".

The one case the scripts won't decide for you is a genuine conflict — the same
lines edited both here and on GitHub. They stop, keep your commit, send nothing,
and say so in the log. That is deliberate: guessing there would lose work.

## Structure

The whole site is **two pages**.

```
index.html              Everything except listings, as anchored sections:
                          #top        hero + search
                          #featured   featured carousel
                          #land-map   all tracts on one map, legend = filter
                          #about      history and timeline
                          #services   eight service lines
                          #timberland land management services
                          #contact    inquiry form + office map
properties.html         Listings: filters, grid/map toggle, detail overlay
assets/css/style.css    Single stylesheet, CSS custom properties at the top
assets/js/app.js        All behavior — routed by <body data-page="...">
data/properties.json    17 active listings
data/ga-counties.json   all 159 Georgia counties (contact form dropdown)
```

### How the listings page works

**Grid / Map toggle.** One filter set feeds both views — switching never resets your filters, and the map only renders pins for what survived the filter. The mode is written to the URL (`?view=map`), so map view is linkable. Leaflet gets an `invalidateSize()` nudge after being un-hidden, otherwise tiles render grey.

**Detail overlay.** Clicking a listing opens a full-screen panel, driven entirely by the URL hash (`properties.html#gene-smith-road`). That means:

- every property is still a real, shareable link
- the browser Back button closes the panel
- "similar tracts" inside the panel swap it in place rather than stacking
- Escape closes it, Tab is trapped inside it, and focus returns to where you were

The detail mini-map is destroyed on close rather than left in memory, so opening twenty properties in a row doesn't leak Leaflet instances.

### Navigation

The main page uses smooth-scroll anchors with a scrollspy that highlights whichever section owns the viewport, plus a thin gold progress rail along the bottom of the sticky header. The scrollspy uses scroll position rather than IntersectionObserver — sections here vary wildly in height, and "most recently passed" reads more naturally than "currently intersecting."

## Offices

| | Address | Phone |
|---|---|---|
| **Nichols Land & Investment Co.** | 2500 Daniells Bridge Rd., Building 200 Suite 1F, Athens, GA 30606 | 706-353-3900 |

The `#contact` section uses a **Google Maps iframe** rather than a scripted map. That's deliberate: the earlier Leaflet version kept rendering as an empty box, and an iframe has no JavaScript, no API key, no tile server and no initialisation timing to get wrong. It either shows a map or it doesn't, and there is nothing to debug.

The office card above the map carries the phone line, and there are "Get directions" and "Open in Google Maps" links for anyone actually travelling there.

To move the pin, edit the `q=` parameter on the iframe `src` in `index.html`.

### The listings map

`properties.html` still uses Leaflet, because 17 filterable pins with popups is not something an iframe can do without a paid API key. It now fails honestly:

- if Leaflet never loads, the Grid/Map toggle is removed entirely rather than offering a button that opens an empty box
- if the map throws while building, the view is replaced with a message and a route back to the grid

## Before this goes live — open items

1. **The hero video is hotlinked to Higgsfield's CDN.** Download it to `assets/video/hero-timberland.mp4` and swap the `<source src>` in `index.html` (there's a TODO comment on the line). Also worth generating a WebM for a smaller file, and rendering a real poster frame from the video rather than reusing a listing photo.

2. **Images are still hotlinked to nicholsland.net.** Every photo, the logo and the PDF maps point at `nicholsland.net/wp-content/uploads/…`. That works today but breaks if the old site is taken down. Download them into `assets/img/` and update the paths (a find-and-replace in `properties.json` and the HTML).

2. **The contact form has no backend.** `initForm()` validates and shows a success message, then logs the payload to the console. Point it at a form handler (Formspree, Netlify Forms, or a PHP/Resend endpoint) before launch.

3. **Map coordinates are approximate.** Each listing has `"coordsApprox": true` — pins are set to the named road or nearest town, not surveyed boundaries. Replace `lat`/`lng` with real coordinates (or add GeoJSON boundaries) when available. The map pages carry a disclaimer in the meantime.

4. **The Jabez Poyner Road listing has no price.** The live page for that tract shows the Poplar Street description and price ($149,500 for 2.5 acres) — clearly a copy/paste error on the current site. Rather than publish a wrong price, it's set to "Call for Price" with a generic description. Needs the real copy and price.

5. **Wilson Lane and Lumber City have no listed price** on the current site either — both show "Call for Price".

6. **Commercial listings are not included.** The old site pushes commercial sale and lease to Crexi widgets (`crexi.com/widgets/75` and `/lease/widgets/69`). Decide whether to embed those widgets, pull the listings via Crexi's API, or manage commercial inventory in `properties.json` too.

8. **The logo is a JPG with a white background baked in.** Handled in CSS for now: `.brand-mark` uses `mix-blend-mode: multiply`, which maps pure white onto whatever sits beneath it, so the white box disappears into the header while the green and black artwork stays untouched. The header carries `isolation: isolate` so the blend can only ever mix with the bar, never with page content scrolling under it.

   This is robust — it doesn't hardcode the bar colour, so it survives a palette change — but it only works over light backgrounds. **Ask the client for a transparent PNG or SVG** and swap the `src`; then the blend mode can be deleted and the logo will work on any background, including a dark footer. The footer currently uses a typographic wordmark for that reason.

## Design notes

**Direction: the plat.** Every tract this firm sells arrives as a drafted plat — a blueline print with a ruled title block in the corner carrying the recorded facts. The whole identity comes from that artifact.

- **Colour** is taken from the print and the ground it describes: `--paper` `#E3E7E0` (cool diazo stock, deliberately not warm cream), `--ink` `#161A15`, `--pine` `#22362A` for structural darks, and `--clay` `#9C4526` — Georgia red clay — as the single accent. Corners are square; a drawing isn't rounded.
- **Type** does three jobs. Libre Caslon Display for headlines, the face American deeds and legal notices were set in. Archivo for prose — a squarish grotesque that reads like county forms. IBM Plex Mono for every recorded fact: acreage, price, county, and all labels, because on a plat labels are typed rather than set.
- **The signature** is the title block itself: ruled cells with a label above and a recorded value below. It opens the hero with live data from the listings and closes the footer with the firm's own details, and tract cards echo it at their foot.

Two deliberate omissions. There are no `01 / 02 / 03` markers on the values — honesty, expertise and stewardship aren't a sequence, so numbering them would be decoration pretending to be structure. And cards don't lift on hover; the hairline shifts to clay instead, because a drawing sits flat on the table.

Everything is set in `:root` at the top of `style.css`. Change `--paper`, `--clay` and `--pine` to reskin the site.
