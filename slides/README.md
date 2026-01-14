# MCPflare Presentation

Self-contained HTML slide deck for introducing MCPflare to developers.

## Quick Start

```bash
# Open in browser (any of these work)
open slides/index.html          # macOS
start slides/index.html         # Windows
xdg-open slides/index.html      # Linux

# Or serve locally for hot-reload during edits
npx serve slides
```

## Keyboard Controls

| Key | Action |
|-----|--------|
| `→` / `Space` / `PageDown` | Next slide |
| `←` / `PageUp` | Previous slide |
| `Home` | First slide |
| `End` | Last slide |
| `N` | Toggle speaker notes |

Touch swipe also works on mobile/tablet.

---

## Talk Track (~5 minutes)

### Pre-Brief (30s)

> "AI agents are powerful—but tools eat your context window and open security gaps. MCPflare fixes both."

### Slide-by-Slide Notes

| Slide | Duration | Key Points |
|-------|----------|------------|
| 1. Title | 30s | Shield icon, three value props: 98% reduction, V8 isolation, zero-trust |
| 2. Context Buildup | 45s | Visual: context fills up with each call. By call 5, 85% gone. |
| 3. Vulnerabilities | 45s | Vertical stack: HIGH → LOW likelihood. Prompt injection, exfil, filesystem, shell, SSRF |
| 4. Solution | 60s | Left: flow diagram. Right: how it fixes context bloat + blocks exploits |
| 5. Protection | 45s | Vertical list with blocked code examples. Each links back to vulnerability |
| 6. Screenshot + CTA | 30s | Show extension UI, stats (98%, 0 default permissions), install links |

---

## Demo Runbook (~3 minutes)

Optional live demo after the slides. Keep it tight—the slides already visualize the key points.

### Pre-Demo Checklist

- [ ] `npm run build` completed successfully
- [ ] VS Code extension installed (visible in sidebar)
- [ ] GitHub MCP configured (token in env)
- [ ] Terminal ready in repo root

### Demo Steps (if doing live demo)

#### 1. Show Extension UI (30s)

Open VS Code → MCPflare panel. Point to:
- Guarded vs unguarded MCPs
- Token savings badge (94% reduction shown)
- Per-MCP config options

#### 2. Network Blocked (1 min)

```bash
npm run cli
mcpflare> execute
# Select: github
# Code: const res = await fetch('https://example.com'); return res.status;
```

**Result:** Blocked. **Say:** "Network disabled by default. Exfiltration blocked."

#### 3. Allowlist Success (1 min)

Add `api.github.com` in extension, then:

```bash
mcpflare> execute
# Code: const res = await fetch('https://api.github.com'); return res.status;
```

**Result:** `200`. **Say:** "Allowlist lets you grant access when needed."

#### 4. Wrap Up (30s)

```bash
mcpflare> exit
```

**Say:** "Efficient. Secure. Simple."

---

## No-Surprises Checklist

Before any demo, verify these match expectations:

| Check | How to Verify | Expected |
|-------|---------------|----------|
| Global enabled state | Extension UI header toggle | Shows "Enabled" or "Disabled" accurately |
| Network policy | Execute fetch in guarded MCP | Blocked unless allowlist configured |
| UI reflects state | Disable globally, check UI | Cards dimmed, banner shows "Disabled" |
| Token savings accurate | Load an MCP, check reported savings | Matches schema token count |

If any check fails, investigate before demoing—the UI must match enforcement.

---

## Exporting to PDF

Several options:

### Option A: Browser Print

1. Open `index.html` in Chrome/Edge
2. Press `Ctrl+P` (or `Cmd+P`)
3. Set "Destination" to "Save as PDF"
4. Set "Layout" to "Landscape"
5. Enable "Background graphics"
6. Save

### Option B: Decktape (higher quality)

```bash
npm install -g decktape
decktape generic slides/index.html slides/mcpflare-deck.pdf --size 1920x1080
```

### Option C: Screenshot each slide

Use browser dev tools to capture each slide as PNG, then combine.

---

## Customization

### Changing Colors

Edit CSS variables in `index.html`:

```css
:root {
  --bg: #0a0e1a;       /* Background */
  --accent: #60a5fa;   /* Primary accent (blue) */
  --accent2: #a78bfa;  /* Secondary accent (purple) */
  --good: #34d399;     /* Positive/success (green) */
  --bad: #f87171;      /* Negative/blocked (red) */
}
```

### Adding Slides

Copy an existing `<section class="slide">` block and modify. Remember to:
1. Add `data-notes="..."` for speaker notes
2. Update the total in `.slide-counter` if hardcoded (it's dynamic now)

### Company Branding

Replace the title slide content and add a logo:
```html
<img src="your-logo.svg" alt="Company Logo" style="height: 60px; margin-bottom: 1rem;" />
```

---

## Troubleshooting

**Slides not advancing:**
- Check browser console for JS errors
- Ensure you're clicking inside the browser window (focus)

**Fonts not loading:**
- The deck uses Google Fonts (DM Sans, Space Grotesk)
- If offline, they fall back to system fonts
- For guaranteed offline: download fonts and embed as base64

**Notes panel not appearing:**
- Press `N` key (case-insensitive)
- Check that `#notesPanel` element exists in HTML

---

## Files

```
slides/
├── index.html    # Self-contained slide deck (CSS/JS inline)
└── README.md     # This file
```
