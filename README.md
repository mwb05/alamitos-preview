# The Alamitos Group — alamitosgroup.com

Static rebuild of the old Hostinger/Zyro site. No build step, no frameworks — plain HTML/CSS/JS.
Source content archive: `..\_source\content-inventory.md`.

## Contents

| File | Page |
|---|---|
| `index.html` | Home — hero, stats, careers video, community, testimonials |
| `services.html` | 10 Jiffy Lube service categories + testimonials |
| `about.html` | Founding story, franchisee-of-the-year, team + community photos |
| `principles.html` | Values, Vision, Mission |
| `careers.html` | 7 roles, benefits, ADP apply link |
| `locations.html` | All 15 stores with tel: links, Directions, JSON-LD per store |
| `employee-resources.html` | Placeholder (see below) |
| `los-angeles-prices.html` | Menu boards — **noindex, not in nav or sitemap** (matches old site) |
| `los-angeles-pennzoil-prices.html` | Pennzoil menu boards — **noindex, not in nav or sitemap** |
| `css/style.css`, `js/main.js` | Styles + mobile nav toggle |
| `favicon.svg` | "A" monogram, works light/dark |
| `sitemap.xml`, `robots.txt` | Main pages only; price pages excluded |
| `assets/` | Optimized images (renamed to readable names) |

## Before going live — action items

1. **Formspree placeholder.** The footer contact form on every main page posts to
   `https://formspree.io/f/PLACEHOLDER`. Create a Formspree form (free tier is fine) and
   replace `PLACEHOLDER` with the real form ID in all 7 main pages (find/replace).
   The old Zyro form posted to Hostinger's builder backend, which goes away with the old site.

2. **Employee Resources content is missing.** The old page was password-gated by Hostinger's
   builder and its content could not be archived. The new page is a dignified placeholder
   ("resources coming soon — contact your store manager"). The original gated content needs to
   be recovered (ask whoever managed the old site) and re-added. If it needs to stay private,
   consider a real solution (host-level auth or a link only shared internally) — client-side
   password gates are trivially bypassed, which is why one wasn't rebuilt here.

3. **Hawthorne phone number needs verification.** Listed as **(301) 644-2588** on the old site —
   301 is a Maryland area code, almost certainly a typo for **(310)**. Kept as-is (also flagged
   with an HTML comment in `locations.html`). Verify with the store before/after launch and fix
   both the visible number and the `tel:` link + JSON-LD entry.

4. **Price boards may be stale.** The menu-board images are dated **Oct 31 2025** (LA prices) and
   **June 2026** (Pennzoil). Confirm they're current before pointing anyone at those URLs.
   Both pages are noindexed and unlinked, same as the old site.

## Notes / judgment calls

- **Employee Resources is in the footer nav only**, not the header (the brief's header nav list
  omitted it; the old site had it in the main nav). Easy to add back to the header `<ul>` on all
  pages if wanted.
- Two unclosed parentheses in the old benefits copy were closed; "The Master technician" was
  capitalized. Everything else is verbatim from the old site.
- Copyright updated 2024 → 2026 and attributed to Alamitos Enterprises, LLC.
- Footer includes a "family of brands" line linking to goldenwesttires.com (sibling rebuild).
- og:image is the drone hero shot (the old site's og:image was empty).
- Images were optimized with .NET System.Drawing (ImageMagick/ffmpeg not installed): heroes
  max 2200px, content photos max 1200px, JPEG quality 82. The 4 price-board PNGs were copied
  at full resolution (fine text). Total image payload went from ~14 MB to ~5.6 MB.
- The Locations hero reuses the old site's storefront webp (1396x366) — it's a wide banner and
  can look slightly soft on very large screens; swap for a better storefront shot if one exists.

## Deploy

Any static host works (Netlify, Cloudflare Pages, GitHub Pages, or plain Hostinger static
hosting): upload the contents of this `site/` folder as the web root. No build step.
DNS stays at Hostinger — just point alamitosgroup.com's A/CNAME records at the new host.
Canonical URLs assume pages are served at `https://alamitosgroup.com/<name>.html` with
`index.html` as the root.
