/**
 * exporter.js — JSON export functionality for PLC Hardware Extractor
 */

'use strict';

/**
 * Exports the parsed PLC data as a pretty-printed JSON file and triggers
 * a browser download.
 *
 * The filename format is: {stationName}_{YYYY-MM-DD}.json
 * Special characters in the station name are replaced with underscores.
 *
 * @param {Object} data - The parsed data object from step7-parser.js
 */
function exportAsJson(data) {
  if (!data) {
    console.error('[exporter] No data provided for export.');
    return;
  }

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });

  // Build filename
  const stationName = (data.station && data.station.name)
    ? data.station.name.replace(/[^a-zA-Z0-9_\-äöüÄÖÜß]/g, '_')
    : 'station';

  const today = new Date();
  const dateStr = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

  const filename = `${stationName}_${dateStr}.json`;

  // Trigger download
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  // Clean up
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

// Expose globally
window.Exporter = { exportAsJson };
