# PLC Hardware Extractor

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Support%20this%20project-yellow?style=flat&logo=buy-me-a-coffee)](https://buymeacoffee.com/spawnsen)

A modern, browser-based tool for analysing and exporting PLC hardware configuration files.  
Everything runs **locally in your browser** — no server, no installation, no data leaves your machine.

---

## ☕ Support

If this tool saves you time, consider buying me a coffee!

[![Buy Me a Coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/spawnsen)

---

## ✨ Features

- 🔍 Parse Siemens STEP 7 `.cfg` hardware configuration files
- 📊 Display rack layout, PROFIBUS DP slaves, and all I/O signals
- 🔎 Filter signals by type (Input/Output) or search by slave name / symbol
- 📦 Export parsed data in multiple formats:
  - 💾 **JSON** — structured, pretty-printed
  - 📊 **CSV** — one file, one section per block
  - 📗 **Excel (.xlsx)** — one sheet per section
  - 🖨️ **PDF / Print** — browser print dialog with formatted report
- 📋 **Inventory List (Bill of Materials)** — summarised device list with quantities
- 🌑 Modern dark-themed UI with responsive layout

---

## 🚀 Live Demo

👉 **[plc-hardware-extractor online](https://spawnsen.github.io/plc-hw-extractor/)**

---

## 🛠️ How to Use

1. Open the app (online or locally by opening `index.html`).
2. Click **STEP 7 → Starten**.
3. Drag & drop your `.cfg` file onto the upload zone, or click to pick a file.
4. Click **Datei analysieren** to parse the file.
5. Browse the results — rack slots, DP slaves, I/O signals.
6. Click **Export** to choose your export format and sections.

> No build step, no dependencies to install, no server needed.

---

## 📁 Supported Formats

| Format | Status |
|--------|--------|
| Siemens STEP 7 `.cfg` | ✅ Available |
| Siemens TIA Portal `.ap1x` | 🔜 Planned |

---

## 🏗️ Project Structure

```
index.html                  ← Landing page with extractor type selection
pages/
  step7.html                ← STEP 7 CFG upload + result view
css/
  style.css                 ← Global styles (shared across pages)
  step7.css                 ← Styles specific to the STEP 7 page
js/
  step7-parser.js           ← CFG file parser logic
  exporter.js               ← Export functionality (JSON / CSV / Excel / PDF)
  ui.js                     ← Shared UI helpers (notifications, state, errors)
assets/
  icons/                    ← Placeholder for future SVG icons
README.md
```

---

## 🔍 What the Parser Extracts

From a STEP 7 `.cfg` file, the parser extracts:

- **File Metadata** — file version, STEP 7 version, creation date
- **Station** — station type, name, asset ID
- **Subnets** — PROFIBUS and Industrial Ethernet networks with NET_ID and baudrate
- **Rack** — rack number, article number, and all module slots (with type detection: CPU / PS / CP / SM)
- **DP Slaves** — PROFIBUS DP slaves with address, GSD file, and their I/O module slots
- **I/O Signals** — flat list of all signals with byte address, bit, symbol name, and comment
- **Inventory (BOM)** — summarised list of all devices with article numbers and quantities

---

## 🗺️ Planned Future Features

- [ ] TIA Portal project file support
- [ ] Signal cross-reference view
- [ ] Hardware comparison between two configuration files
- [ ] Offline PWA support

---

## 🤝 Contributing

Contributions, issues and feature requests are welcome!  
Feel free to open an [issue](https://github.com/Spawnsen/plc-hw-extractor/issues) or submit a pull request.

---

## ☕ Buy Me a Coffee

If this project is useful to you, a small donation helps keep development going:

👉 [https://buymeacoffee.com/spawnsen](https://buymeacoffee.com/spawnsen)

---

## 📄 License

MIT
