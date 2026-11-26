# Visual reference notes (September 2020 baseline)

No dated screenshots were supplied with the request, so **no pixel comparison was
performed** and none is claimed. The layout was reconstructed from the published 2019–2020
material listed below plus the target values in the brief.

## Referenced (from the brief's dated sources)

- The July 2019 redesign: three-column layout (left navigation with Home, Explore,
  Notifications, Messages, Bookmarks, Lists, Profile, More), Explore replacing Moments in
  the main nav, Bookmarks and Lists in the nav, dark modes (Dim, Lights out) and the
  font-size / color customisation.
- Responsive single codebase for desktop, tablet and phone (bottom navigation on phones).
- August 2020 conversation settings: Everyone / People you follow / Only people you mention.
- November 2019 hidden replies (author can hide; anyone can view hidden replies).
- Excluded as post-baseline: Fleets (Nov 2020), Chirp typeface (Jan 2021), and later
  products (X branding, Grok, Premium, Communities, Community Notes, Spaces, articles,
  public view counts, editing).

## Brief targets implemented as specified

Feed 600 px; expanded nav 275 px; rail 350 px (290 px at medium widths); header 53 px;
avatars 48/40 px; post text 15/20 px; headings ~19 px bold; colors #14171A / #657786 /
#E6ECF0 / #F5F8FA; brand action blue #1839E8; system font stack.

## Inferred (best-effort reconstruction, not measured)

- Breakpoints: nav labels at ≥ 1282 px, icon rail 500–1281 px, right rail at ≥ 1002 px
  (290 px) and ≥ 1092 px (350 px), phone layout below 500 px.
- Post overflow control uses "…" (the brief's era moved from a caret to "…"; exact date not verified).
- Home header ✦ (sparkle) switch between top posts and latest posts.
- Dim (#15202B) and Lights out (#000000) palettes and secondary text colors.
- Accent palette values were adjusted for ≥ 4.5:1 contrast with button text rather than copied.
- Icon set: Lucide line icons at ~1.75 stroke with filled active states — chosen to match
  optical weight, not copied from any proprietary icon set.
- Trend rows, Who-to-follow module, notification grouping, DM bubble styling and the
  Display dialog layout are reconstructions.

## Brand

The supplied raster logo (`assets/brand/ischoolie-logo-master-1280.png`, symbol #1838E8,
wordmark #141418) is the master. Derived assets (scripts/build-brand-assets.ts):
exact color-to-alpha background removal, trimmed full logo, a crop of the existing symbol
for compact placements and favicons, and a dark-surface variant that keeps the symbol
pixels and recolors only the wordmark ink to a light neutral. Nothing was traced or redrawn.
A second supplied file (`ischoolie-logo-master-2172.png`, pure #001CF0/black) is kept
but unused because its colors don't match the brief's sampled values.
