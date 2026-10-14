# Printing with two inks

A risograph prints one colour per pass, so the most interesting work happens with *just two*: one dark, one bright, and whatever they make where they overlap.

## Preparing the separations

Each ink needs its own greyscale file, exported at the same size:

```ts
// One greyscale layer per ink, same canvas size.
for (const ink of ["blue", "pink"] as const) {
  const layer = doc.layers.find((l) => l.name === ink);
  await layer.export(`separations/${ink}.png`, { dpi: 600 });
}
```

## Choosing a pair

> The misregistration isn't a flaw to fix. It's the fingerprint that tells you a person, not a printer driver, made this.

Start from contrast, then from mood. A dark ink carries the text; a bright ink carries the feeling.

| Dark ink | Bright ink | Overlap reads as |
|---|---|---|
| Medium Blue | Fluorescent Pink | deep violet |
| Black | Yellow | olive |
| Teal | Orange | warm brown |

## Before the first pass

- [x] Paper conditioned overnight
- [x] Masters cut for both drums
- [ ] Test sheet on newsprint
- [ ] Dry time between passes[^dry]

[^dry]: Fluorescent inks stay tacky longer than you expect. Give them an hour.
