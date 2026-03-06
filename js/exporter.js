/**
 * exporter.js — Export functionality for PLC Hardware Extractor
 * Supports JSON, CSV, Excel (.xlsx via SheetJS) and PDF/Print exports.
 */

'use strict';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns today's date string as YYYY-MM-DD.
 * @returns {string}
 */
function _dateStr() {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Derives a safe station name for use in filenames.
 * @param {Object} data
 * @returns {string}
 */
function _stationName(data) {
  return (data.station && data.station.name)
    ? data.station.name.replace(/[^a-zA-Z0-9_\-äöüÄÖÜß]/g, '_')
    : 'station';
}

/**
 * Triggers a browser download for the given blob.
 * @param {Blob} blob
 * @param {string} filename
 */
function _download(blob, filename) {
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href        = url;
  link.download    = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Escapes a value for use inside a CSV cell.
 * @param {*} val
 * @returns {string}
 */
function _csvCell(val) {
  const s = val == null ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Converts an array of values to a CSV row string.
 * @param {Array} row
 * @returns {string}
 */
function _csvRow(row) {
  return row.map(_csvCell).join(',');
}

// ── Inventory Builder ──────────────────────────────────────────────────────

/**
 * Builds the inventory list (Summenstückliste) from parsed data.
 * Aggregates Rack slots, DP-Slaves, and DP-Slave modules by article number.
 *
 * @param {Object} data - The parsed data object from step7-parser.js
 * @returns {Array<{articleNumber:string, name:string, type:string, count:number}>}
 */
function buildInventory(data) {
  const map = new Map(); // key: articleNumber|name

  // Rack slots
  for (const slot of (data.rack && data.rack.slots || [])) {
    const key = slot.articleNumber || slot.name;
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
    } else {
      map.set(key, {
        articleNumber: slot.articleNumber || '–',
        name:          slot.name          || '–',
        type:          slot.type          || 'Unbekannt',
        count:         1,
      });
    }
  }

  // DP-Slaves
  for (const slave of (data.dpSlaves || [])) {
    const key = slave.gsdFile || slave.name;
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
    } else {
      map.set(key, {
        articleNumber: slave.gsdFile || '–',
        name:          slave.name    || '–',
        type:          'DP-Slave',
        count:         1,
      });
    }
  }

  // DP-Slave module slots
  for (const slave of (data.dpSlaves || [])) {
    for (const slot of (slave.slots || [])) {
      const key = slot.moduleType || slot.moduleName;
      if (!key) continue;
      const existing = map.get(key);
      if (existing) {
        existing.count++;
      } else {
        map.set(key, {
          articleNumber: slot.moduleType  || '–',
          name:          slot.moduleName  || '–',
          type:          'DP-Modul',
          count:         1,
        });
      }
    }
  }

  // PROFINET IO devices
  for (const dev of (data.pnDevices || [])) {
    const key = dev.mlfb || dev.name;
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
    } else {
      map.set(key, {
        articleNumber: dev.mlfb || '–',
        name:          dev.name || '–',
        type:          'PN-Device',
        count:         1,
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

// ── Section Data Builders ──────────────────────────────────────────────────

/**
 * Returns the data object filtered to only the requested sections.
 * @param {Object} data
 * @param {string[]} sections
 * @returns {Object}
 */
function _filteredData(data, sections) {
  const result = {};
  if (sections.includes('station'))    result.station   = data.station;
  if (sections.includes('networks'))   result.subnets   = data.subnets;
  if (sections.includes('rack'))       result.rack      = data.rack;
  if (sections.includes('slaves'))     result.dpSlaves  = data.dpSlaves;
  if (sections.includes('pndevices'))  result.pnDevices = data.pnDevices;
  if (sections.includes('signals'))    result.signals   = data.signals;
  if (sections.includes('inventory'))  result.inventory = buildInventory(data);
  return result;
}

// ── JSON Export ────────────────────────────────────────────────────────────

/**
 * Exports the parsed PLC data as a pretty-printed JSON file.
 *
 * @param {Object}   data     - The parsed data object from step7-parser.js
 * @param {string[]} sections - Array of section keys to include
 */
function exportAsJson(data, sections) {
  if (!data) {
    console.error('[exporter] No data provided for export.');
    return;
  }

  const payload = sections && sections.length ? _filteredData(data, sections) : data;
  const json    = JSON.stringify(payload, null, 2);
  const blob    = new Blob([json], { type: 'application/json' });
  _download(blob, `${_stationName(data)}_${_dateStr()}.json`);
}

// ── CSV Export ─────────────────────────────────────────────────────────────

/**
 * Exports the parsed PLC data as a single CSV file with one block per section.
 *
 * @param {Object}   data
 * @param {string[]} sections
 */
function exportAsCsv(data, sections) {
  if (!data) {
    console.error('[exporter] No data provided for export.');
    return;
  }

  const activeSections = sections && sections.length ? sections : ['station', 'networks', 'rack', 'slaves', 'pndevices', 'signals', 'inventory'];
  const blocks = [];

  // Station Info
  if (activeSections.includes('station') && data.station) {
    const s = data.station;
    blocks.push([
      '=== Station Info ===',
      _csvRow(['Feld', 'Wert']),
      _csvRow(['Name',         s.name          || '']),
      _csvRow(['Typ',          s.type          || '']),
      _csvRow(['Asset-ID',     s.assetId       || '']),
      _csvRow(['Dateiversion', s.fileVersion   || '']),
      _csvRow(['STEP7 Version',s.step7Version  || '']),
      _csvRow(['Erstellt',     s.createdAt     || '']),
    ].join('\n'));
  }

  // Netzwerke
  if (activeSections.includes('networks') && data.subnets && data.subnets.length) {
    const rows = ['=== Netzwerke ===', _csvRow(['Name', 'Typ', 'Net-ID', 'Baudrate'])];
    for (const net of data.subnets) {
      rows.push(_csvRow([net.name || '', net.type || '', net.netId || '', net.baudrate || '']));
    }
    blocks.push(rows.join('\n'));
  }

  // Rack-Konfiguration
  if (activeSections.includes('rack') && data.rack && data.rack.slots && data.rack.slots.length) {
    const rows = ['=== Rack-Konfiguration ===', _csvRow(['Slot', 'Bestellnummer', 'Name', 'Typ', 'Firmware'])];
    for (const slot of data.rack.slots) {
      rows.push(_csvRow([slot.slot, slot.articleNumber || '', slot.name || '', slot.type || '', slot.firmware || '']));
    }
    blocks.push(rows.join('\n'));
  }

  // DP-Slaves
  if (activeSections.includes('slaves') && data.dpSlaves && data.dpSlaves.length) {
    const rows = ['=== DP-Slaves ===', _csvRow(['DP-Adresse', 'GSD-Datei', 'Slave-Name', 'Slot', 'Modul', 'Richtung', 'Byte-Adresse'])];
    for (const slave of data.dpSlaves) {
      if (!slave.slots || !slave.slots.length) {
        rows.push(_csvRow([slave.dpAddress, slave.gsdFile || '', slave.name || '', '', '', '', '']));
      } else {
        for (const slot of slave.slots) {
          rows.push(_csvRow([slave.dpAddress, slave.gsdFile || '', slave.name || '', slot.slot, slot.moduleType || '', slot.direction || '', slot.byteAddress != null ? slot.byteAddress : '']));
        }
      }
    }
    blocks.push(rows.join('\n'));
  }

  // PROFINET IO Devices
  if (activeSections.includes('pndevices') && data.pnDevices && data.pnDevices.length) {
    const rows = ['=== PROFINET IO-Geräte ===', _csvRow(['MLFB', 'Name', 'IP-Adresse', 'Subnetzmaske', 'MAC', 'Asset-ID', 'GSDML'])];
    for (const dev of data.pnDevices) {
      rows.push(_csvRow([dev.mlfb || '', dev.name || '', dev.ip || dev.ipHex || '', dev.subnetMask || dev.subnetMaskHex || '', dev.mac || '', dev.assetId || '', dev.gsdml || '']));
    }
    blocks.push(rows.join('\n'));
  }

  // I/O Signale
  if (activeSections.includes('signals') && data.signals && data.signals.length) {
    const rows = ['=== I/O Signale ===', _csvRow(['Slave', 'DP-Adresse', 'Modul', 'Slot', 'Typ', 'Byte', 'Bit', 'Symbolname', 'Kommentar'])];
    for (const sig of data.signals) {
      rows.push(_csvRow([
        sig.slaveName    || '',
        sig.slaveAddress != null ? sig.slaveAddress : '',
        sig.module       || '',
        sig.slot         != null ? sig.slot : '',
        sig.type         || '',
        sig.byteAddress  != null ? sig.byteAddress : '',
        sig.bit          != null ? sig.bit : '',
        sig.symbolName   || '',
        sig.comment      || '',
      ]));
    }
    blocks.push(rows.join('\n'));
  }

  // Inventarliste
  if (activeSections.includes('inventory')) {
    const inventory = buildInventory(data);
    const rows = ['=== Inventarliste (Summenstückliste) ===', _csvRow(['Bestellnummer', 'Name/Modul', 'Typ', 'Menge'])];
    for (const item of inventory) {
      rows.push(_csvRow([item.articleNumber, item.name, item.type, item.count]));
    }
    blocks.push(rows.join('\n'));
  }

  const csv  = blocks.join('\n\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  _download(blob, `${_stationName(data)}_${_dateStr()}.csv`);
}

// ── Excel Export ───────────────────────────────────────────────────────────

/**
 * Exports the parsed PLC data as an Excel (.xlsx) workbook.
 * Requires SheetJS (XLSX) to be loaded via CDN.
 *
 * @param {Object}   data
 * @param {string[]} sections
 */
function exportAsExcel(data, sections) {
  if (!data) {
    console.error('[exporter] No data provided for export.');
    return;
  }

  if (typeof XLSX === 'undefined') {
    console.error('[exporter] SheetJS (XLSX) library is not loaded.');
    if (window.UI && typeof UI.showNotification === 'function') {
      UI.showNotification('Excel-Export nicht verfügbar: SheetJS-Bibliothek konnte nicht geladen werden.', 'error');
    }
    return;
  }

  const activeSections = sections && sections.length ? sections : ['station', 'networks', 'rack', 'slaves', 'pndevices', 'signals', 'inventory'];
  const wb = XLSX.utils.book_new();

  // Station Info
  if (activeSections.includes('station') && data.station) {
    const s = data.station;
    const aoa = [
      ['Feld', 'Wert'],
      ['Name',          s.name         || ''],
      ['Typ',           s.type         || ''],
      ['Asset-ID',      s.assetId      || ''],
      ['Dateiversion',  s.fileVersion  || ''],
      ['STEP7 Version', s.step7Version || ''],
      ['Erstellt',      s.createdAt    || ''],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Station Info');
  }

  // Netzwerke
  if (activeSections.includes('networks') && data.subnets) {
    const aoa = [['Name', 'Typ', 'Net-ID', 'Baudrate']];
    for (const net of (data.subnets || [])) {
      aoa.push([net.name || '', net.type || '', net.netId || '', net.baudrate || '']);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Netzwerke');
  }

  // Rack
  if (activeSections.includes('rack') && data.rack) {
    const aoa = [['Slot', 'Bestellnummer', 'Name', 'Typ', 'Firmware']];
    for (const slot of (data.rack.slots || [])) {
      aoa.push([slot.slot, slot.articleNumber || '', slot.name || '', slot.type || '', slot.firmware || '']);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Rack');
  }

  // DP-Slaves
  if (activeSections.includes('slaves') && data.dpSlaves) {
    const aoa = [['DP-Adresse', 'GSD-Datei', 'Slave-Name', 'Slot', 'Modul', 'Richtung', 'Byte-Adresse']];
    for (const slave of (data.dpSlaves || [])) {
      if (!slave.slots || !slave.slots.length) {
        aoa.push([slave.dpAddress, slave.gsdFile || '', slave.name || '', '', '', '', '']);
      } else {
        for (const slot of slave.slots) {
          aoa.push([slave.dpAddress, slave.gsdFile || '', slave.name || '', slot.slot, slot.moduleType || '', slot.direction || '', slot.byteAddress != null ? slot.byteAddress : '']);
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'DP-Slaves');
  }

  // PROFINET IO Devices
  if (activeSections.includes('pndevices') && data.pnDevices && data.pnDevices.length) {
    const aoa = [['MLFB', 'Name', 'IP-Adresse', 'Subnetzmaske', 'MAC', 'Asset-ID', 'GSDML']];
    for (const dev of data.pnDevices) {
      aoa.push([dev.mlfb || '', dev.name || '', dev.ip || dev.ipHex || '', dev.subnetMask || dev.subnetMaskHex || '', dev.mac || '', dev.assetId || '', dev.gsdml || '']);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'PROFINET IO');
  }

  // IO-Signale
  if (activeSections.includes('signals') && data.signals) {
    const aoa = [['Slave', 'DP-Adresse', 'Modul', 'Slot', 'Typ', 'Byte', 'Bit', 'Symbolname', 'Kommentar']];
    for (const sig of (data.signals || [])) {
      aoa.push([
        sig.slaveName    || '',
        sig.slaveAddress != null ? sig.slaveAddress : '',
        sig.module       || '',
        sig.slot         != null ? sig.slot : '',
        sig.type         || '',
        sig.byteAddress  != null ? sig.byteAddress : '',
        sig.bit          != null ? sig.bit : '',
        sig.symbolName   || '',
        sig.comment      || '',
      ]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'IO-Signale');
  }

  // Inventarliste
  if (activeSections.includes('inventory')) {
    const inventory = buildInventory(data);
    const aoa = [['Bestellnummer', 'Name/Modul', 'Typ', 'Menge']];
    for (const item of inventory) {
      aoa.push([item.articleNumber, item.name, item.type, item.count]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Inventarliste');
  }

  XLSX.writeFile(wb, `${_stationName(data)}_${_dateStr()}.xlsx`);
}

// ── PDF / Print Export ─────────────────────────────────────────────────────

/**
 * Opens a print-optimised HTML page in a new window and triggers the browser
 * print dialog.
 *
 * @param {Object}   data
 * @param {string[]} sections
 */
function exportAsPdf(data, sections) {
  if (!data) {
    console.error('[exporter] No data provided for export.');
    return;
  }

  const activeSections = sections && sections.length ? sections : ['station', 'networks', 'rack', 'slaves', 'pndevices', 'signals', 'inventory'];
  const stationName    = (data.station && data.station.name) || 'Unbekannte Station';
  const dateLabel      = _dateStr();

  // ── helper: build an HTML table from headers + rows ──────────
  function _htmlTable(headers, rows) {
    const ths = headers.map(h => `<th>${_esc(h)}</th>`).join('');
    const trs = rows.map(r =>
      '<tr>' + r.map(c => `<td>${_esc(c == null ? '' : String(c))}</td>`).join('') + '</tr>'
    ).join('');
    return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const sectionHtml = [];

  // Station Info
  if (activeSections.includes('station') && data.station) {
    const s = data.station;
    sectionHtml.push(`<section><h2>Station Info</h2>${_htmlTable(['Feld', 'Wert'], [
      ['Name',          s.name         || ''],
      ['Typ',           s.type         || ''],
      ['Asset-ID',      s.assetId      || ''],
      ['Dateiversion',  s.fileVersion  || ''],
      ['STEP7 Version', s.step7Version || ''],
      ['Erstellt',      s.createdAt    || ''],
    ])}</section>`);
  }

  // Netzwerke
  if (activeSections.includes('networks') && data.subnets && data.subnets.length) {
    const rows = data.subnets.map(n => [n.name || '', n.type || '', n.netId || '', n.baudrate || '']);
    sectionHtml.push(`<section><h2>Netzwerke</h2>${_htmlTable(['Name', 'Typ', 'Net-ID', 'Baudrate'], rows)}</section>`);
  }

  // Rack
  if (activeSections.includes('rack') && data.rack && data.rack.slots && data.rack.slots.length) {
    const rows = data.rack.slots.map(s => [s.slot, s.articleNumber || '', s.name || '', s.type || '', s.firmware || '']);
    sectionHtml.push(`<section><h2>Rack-Konfiguration</h2>${_htmlTable(['Slot', 'Bestellnummer', 'Name', 'Typ', 'Firmware'], rows)}</section>`);
  }

  // DP-Slaves
  if (activeSections.includes('slaves') && data.dpSlaves && data.dpSlaves.length) {
    const rows = [];
    for (const slave of data.dpSlaves) {
      if (!slave.slots || !slave.slots.length) {
        rows.push([slave.dpAddress, slave.gsdFile || '', slave.name || '', '', '', '', '']);
      } else {
        for (const slot of slave.slots) {
          rows.push([slave.dpAddress, slave.gsdFile || '', slave.name || '', slot.slot, slot.moduleType || '', slot.direction || '', slot.byteAddress != null ? slot.byteAddress : '']);
        }
      }
    }
    sectionHtml.push(`<section><h2>DP-Slaves</h2>${_htmlTable(['DP-Adresse', 'GSD-Datei', 'Slave-Name', 'Slot', 'Modul', 'Richtung', 'Byte-Adresse'], rows)}</section>`);
  }

  // PROFINET IO Devices
  if (activeSections.includes('pndevices') && data.pnDevices && data.pnDevices.length) {
    const rows = data.pnDevices.map(dev => [dev.mlfb || '', dev.name || '', dev.ip || dev.ipHex || '', dev.subnetMask || dev.subnetMaskHex || '', dev.mac || '', dev.assetId || '', dev.gsdml || '']);
    sectionHtml.push(`<section><h2>PROFINET IO-Geräte</h2>${_htmlTable(['MLFB', 'Name', 'IP-Adresse', 'Subnetzmaske', 'MAC', 'Asset-ID', 'GSDML'], rows)}</section>`);
  }

  // I/O Signale
  if (activeSections.includes('signals') && data.signals && data.signals.length) {
    const rows = data.signals.map(sig => [
      sig.slaveName    || '',
      sig.slaveAddress != null ? sig.slaveAddress : '',
      sig.module       || '',
      sig.slot         != null ? sig.slot : '',
      sig.type         || '',
      sig.byteAddress  != null ? sig.byteAddress : '',
      sig.bit          != null ? sig.bit : '',
      sig.symbolName   || '',
      sig.comment      || '',
    ]);
    sectionHtml.push(`<section><h2>I/O Signale</h2>${_htmlTable(['Slave', 'DP-Adresse', 'Modul', 'Slot', 'Typ', 'Byte', 'Bit', 'Symbolname', 'Kommentar'], rows)}</section>`);
  }

  // Inventarliste
  if (activeSections.includes('inventory')) {
    const inventory = buildInventory(data);
    const rows = inventory.map(item => [item.articleNumber, item.name, item.type, item.count]);
    sectionHtml.push(`<section><h2>Inventarliste (Summenstückliste)</h2>${_htmlTable(['Bestellnummer', 'Name/Modul', 'Typ', 'Menge'], rows)}</section>`);
  }

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <title>PLC Hardware Extractor – Bericht</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; background: #fff; padding: 20px; }
    h1   { font-size: 18pt; margin-bottom: 4px; }
    h2   { font-size: 13pt; margin: 24px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    .subtitle { font-size: 12pt; color: #555; margin-bottom: 4px; }
    .date     { font-size: 9pt;  color: #777; margin-bottom: 20px; }
    table  { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 8px; }
    th     { background: #f0f0f0; text-align: left; padding: 5px 8px; border: 1px solid #ccc; font-weight: bold; }
    td     { padding: 4px 8px; border: 1px solid #ddd; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    section { page-break-inside: avoid; }
    @media print {
      body { padding: 0; }
      section { page-break-inside: avoid; }
      h2 { page-break-after: avoid; }
    }
  </style>
</head>
<body>
  <h1>PLC Hardware Extractor – Bericht</h1>
  <div class="subtitle">${_esc(stationName)}</div>
  <div class="date">Erstellt am: ${_esc(dateLabel)}</div>
  ${sectionHtml.join('\n')}
  <script>window.onload = function(){ window.print(); };<\/script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    console.error('[exporter] Could not open print window (popup blocked?).');
    if (window.UI && typeof UI.showNotification === 'function') {
      UI.showNotification('Druckfenster konnte nicht geöffnet werden. Bitte Popup-Blocker deaktivieren.', 'error');
    }
    return;
  }
  win.document.write(html);
  win.document.close();
}

// ── Public API ─────────────────────────────────────────────────────────────

window.Exporter = {
  exportAsJson,
  exportAsCsv,
  exportAsExcel,
  exportAsPdf,
  buildInventory,
};
