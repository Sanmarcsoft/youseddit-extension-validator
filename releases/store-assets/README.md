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
