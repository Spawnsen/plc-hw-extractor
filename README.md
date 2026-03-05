# PLC Hardware Extractor

A modern, browser-based tool for analysing and exporting PLC hardware configuration files.  
Everything runs locally — **no server, no installation required**.

---

## Features

- 🔍 Parse Siemens STEP 7 `.cfg` hardware configuration files
- 📊 Display rack layout, PROFIBUS DP slaves, and all I/O signals
- 🔎 Filter signals by type (Input/Output) or search by slave name / symbol
- 💾 Export parsed data as structured, pretty-printed JSON
- 🌑 Modern dark-themed UI with responsive layout

---

## How to Use

1. Clone or download this repository.
2. Open `index.html` in any modern browser (Chrome, Firefox, Edge, Safari).
3. Click **STEP 7 → Starten**.
4. Drag & drop your `.cfg` file onto the upload zone, or click to pick a file.
5. Click **Datei analysieren** to parse the file.
6. Browse the results and click **JSON exportieren** to download the data.

> No build step, no dependencies to install, no server needed.

---

## Supported Formats

| Format | Status |
|--------|--------|
| Siemens STEP 7 `.cfg` | ✅ Available |
| Siemens TIA Portal `.ap1x` | 🔜 Planned |
| Allen-Bradley RSLogix 5000 | 🔜 Planned |

---

## Project Structure

```
index.html                  ← Landing page with extractor type selection
pages/
  step7.html                ← STEP 7 CFG upload + result view
css/
  style.css                 ← Global styles (shared across pages)
  step7.css                 ← Styles specific to the STEP 7 page
js/
  step7-parser.js           ← CFG file parser logic
  exporter.js               ← JSON export functionality
  ui.js                     ← Shared UI helpers (notifications, state, errors)
assets/
  icons/                    ← Placeholder for future SVG icons
README.md
```

---

## What the Parser Extracts

From a STEP 7 `.cfg` file, the parser extracts:

- **File Metadata** — file version, STEP 7 version, creation date
- **Station** — station type, name, asset ID
- **Subnets** — PROFIBUS and Industrial Ethernet networks with NET_ID and baudrate
- **Rack** — rack number, article number, and all module slots (with type detection: CPU / PS / CP / SM)
- **DP Slaves** — PROFIBUS DP slaves with address, GSD file, and their I/O module slots
- **I/O Signals** — flat list of all signals with byte address, bit, symbol name, and comment

---

## Planned Future Features

- [ ] TIA Portal project file support
- [ ] RSLogix / Studio 5000 support
- [ ] CSV export option
- [ ] Signal cross-reference view
- [ ] Hardware comparison between two configuration files
- [ ] Offline PWA support

---

## License

MIT