# Chrome Web Store listing assets

## `store-icon-128.png`

The store icon, 128x128 PNG, RGBA with a transparent margin.

Built from `verifieddit-icon-source.svg`, which is the favicon
`https://www.verifieddit.com/verifieddit-icon.svg` served by the live site, so
the store tile and the website carry the same mark rather than drifting apart.

Per the Chrome Web Store image guidelines, the artwork occupies **96x96 centred
inside the 128x128 frame**, leaving 16px of transparent padding on every side.
The store composites its own shadow and rounding onto that frame; artwork run to
the edge gets visually clipped. `store-icon-128.svg` is the composition source
(a 128 viewBox wrapping the 256 artwork at `scale(0.375) translate(16,16)`), so
the padding is exact rather than resampled from a bitmap.

Regenerate:

```bash
sips -s format png store-icon-128.svg --out store-icon-128.png
```

Render on a host that has Inter, Helvetica or Arial. The mark includes a text
element, and a renderer without those fonts silently drops the "it" and emits a
checkmark on its own. Check the output before shipping it.

Reference: https://developer.chrome.com/docs/webstore/images#icons

## Note on `public/icons/vd128.png`

That is the **extension** icon, bundled in the artifact and shown in the
toolbar. It is a different asset with different framing (no padding, no "it")
and is not interchangeable with this one.

## Promo tiles

| File | Canvas | Format |
|---|---|---|
| `marquee-promo-1400x560.jpg` | 1400x560 | JPEG, 24-bit RGB, no alpha |
| `small-promo-440x280.jpg` | 440x280 | JPEG, 24-bit RGB, no alpha |

Both are composed in SVG (`*.svg` alongside) and rendered on a host carrying
Helvetica or Arial, for the same reason as the icon: the brand mark contains a
text element, and a renderer without those fonts drops the "it" silently.

The store forbids an alpha channel on promo tiles. Each SVG paints an opaque
base rect before anything else, and the export goes through JPEG, which has no
alpha channel by definition. Verify before uploading:

```bash
sips -g pixelWidth -g pixelHeight -g hasAlpha marquee-promo-1400x560.jpg
```

`hasAlpha: no` is the check that matters.

The small tile is not a scaled marquee. At roughly a tenth of the area the
marquee's copy is unreadable, so it carries the mark, the name and one line,
with the four verdict states reduced to colour alone.

Both lead on the four badge states including **unsigned**, the state most
verification tools omit. Naming it is what makes the other three credible.

Regenerate:

```bash
sips -s format png marquee-promo-1400x560.svg --out raw.png
sips -s format jpeg -s formatOptions 95 raw.png --out marquee-promo-1400x560.jpg
```
