# Static assets (`/public`)

Files here are served at the site root. Example: `public/proven-logo.png` → `/proven-logo.png`.

## Brand logo

The Proven Realty logo (Proven Realty + "brokered by eXp" lockup) is the default
logo for anything built in this app. Save it here as:

- `public/proven-logo.png` — the full lockup (primary)

Reference it in components with Next.js `Image`:

```tsx
import Image from "next/image";

<Image src="/proven-logo.png" alt="Proven Realty, brokered by eXp" width={220} height={64} priority />
```
