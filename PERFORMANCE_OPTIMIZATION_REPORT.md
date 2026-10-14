# Website Performance Optimization Report

## Purpose and motive

The work focused on making ISAAC MEDIA feel faster on mobile, especially on the first screen and on slower connections. The homepage is photography-heavy, so large image downloads and JavaScript work during startup compete with the content a visitor needs to see first. The changes aim to show the hero quickly, send appropriately sized images to each screen, and delay work that is not immediately visible.

This summary is based on the repository history and current code. The commits describe Lighthouse and performance goals, but this repository does not contain before-and-after Lighthouse scores, network traces, or field metrics; no numerical improvement is claimed here.

## What was implemented

### Faster first screen and hero

- The mobile hero image is compressed and separate mobile hero images are used for slideshow rotation. The desktop retains its larger images.
- The initial hero image is present in the HTML as a responsive `<picture>` image, with viewport-specific preloads and high fetch priority. This makes it discoverable before JavaScript runs and exposes it as the likely Largest Contentful Paint image.
- The main stylesheet is loaded once as a render-blocking stylesheet at every viewport size. The earlier mobile-only async activation could apply the full layout after the first paint, so this favors a stable layout over an unstyled early paint. The latest PageSpeed mobile report showed CLS 1.0; a fresh run is still needed to confirm the effect.
- JavaScript startup work is split across idle callbacks where available, with a timeout fallback, instead of running all initializers together.
- The Google Fonts stylesheet is requested at low priority and uses `font-display: optional`. This avoids holding up initial text or forcing a late font swap; on some visits the system fallback can remain in use.

### Images matched to screen size

- Responsive image candidates were added for gallery, package, and team images. `srcset` and `sizes` let the browser select an appropriate file for the rendered size and device density.
- Smaller gallery variants were added specifically for phones, with medium and larger candidates retained for wider displays.
- Images below the initial view use lazy loading and low fetch priority. The large gallery modal releases each image through an `IntersectionObserver` shortly before it is scrolled into view, rather than requesting the whole collection when the modal opens.
- Event and hero slides load sequentially as needed. Slideshow timers pause when their content is off-screen or the page is hidden.

### Kept the visual experience usable

- Mobile hero slideshow rotation was restored after an earlier startup optimization, using compact mobile assets and deferred slide loading.
- The first slide paints from HTML/CSS before slideshow JavaScript initializes.
- Slideshow rotation respects the reduced-motion preference. Mobile hero entrance animations are disabled so the headline and actions appear immediately.

## Tradeoffs and what we let go

- **Full-size imagery on every device:** mobile visitors now receive smaller variants where available. This reduces transferred bytes, with a possible sharpness tradeoff on high-density phones at some display sizes. Larger candidates remain available for larger layouts and higher device-pixel-ratio needs.
- **Loading the full visual collection up front:** gallery and slideshow imagery is deferred. A photo may take a moment to appear when first brought near the viewport, but initial page loading does less work and downloads fewer unseen images.
- **Animated mobile hero entrance:** the staggered text and decorative entrance effects were removed from the mobile first paint so visitors see the message and calls to action without waiting for animation delays.
- **Guaranteed custom font on first paint:** the optional, low-priority font request favors immediate readable text over waiting for custom typography. Depending on cache and connection timing, fallback fonts may be shown for the visit.
- **Mobile stylesheet timing:** applying the full CSS before first paint can delay FCP on a slow connection, but avoids moving page content when the stylesheet activates later.
- **Uninterrupted background activity:** off-screen slideshows and hidden-tab timers stop, reducing unnecessary work. Hero rotation is still retained while the hero is visible.

## Why these choices

The order of work follows what a visitor notices first: establish the hero and core styles promptly, then reduce the cost of the many photographs and postpone off-screen work. The implementation preserves the photographic portfolio and slideshow behavior while changing when and how much imagery the browser fetches. It also trades some decorative motion and certainty of custom fonts on first paint for earlier usable content.

## Evidence and follow-up

The Git history records commits for mobile Lighthouse improvement, hero loading, responsive image candidates, gallery loading, startup scheduling, and critical mobile rendering. It does not include benchmark output. To quantify the result, capture comparable mobile Lighthouse runs before and after deployment, and monitor real-user Core Web Vitals (especially LCP and INP) across representative devices and network conditions.
