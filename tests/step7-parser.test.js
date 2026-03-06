/**
 * step7-parser.test.js — Minimal unit tests for step7-parser.js
 *
 * Run with: node tests/step7-parser.test.js
 * No external dependencies required.
 */

'use strict';

// ── Shim `window` so step7-parser.js can be loaded in Node.js ─────────────
globalThis.window = {};

// Load the parser
require('../js/step7-parser.js');
const { parseStep7Cfg } = window.Step7Parser;

// ── Minimal test runner ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  const ok = actual === expected;
  if (ok) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const IOSUBSYSTEM_SNIPPET = `
IOSUBSYSTEM 1, 5, 1, "GSDML-V2.3-Siemens-ET200SP-20150902.xml", "et200sp-device"
BEGIN
  NAME "ET200SP_Station_1"
  ASSET_ID "ASSET-001"
  MLFB "6ES7 155-6AU00-0BN0"
  MACADDRESS 00 1C 06 1A 2B 3C
  IPADDRESS 0A 01 00 05
  SUBNETMASK FF FF FF 00
  ROUTERADDRESS 0A 01 00 01
  PN_SW_RELEASE "V4.1"
  PN_HW_RELEASE "V1.0"
  PN_MIN_VERSION "V2.3"
  LOCAL_IN_ADDRESSES
  BEGIN
    ADDRESS 100, 0, 4, 0, 0, 0
  END
END
`;

const RACK_SIMPLE_SNIPPET = `
RACK 0, "6ES7 400-1JA01-0AA0", "UR2"
RACK 0, SLOT 1, "6ES7 407-0KA01-0AA0", "PS 407 10A"
RACK 0, SLOT 3, "6ES7 416-2XK02-0AB0", "CPU1_Main"
`;

const RACK_FIRMWARE_SNIPPET = `
RACK 0, "6ES7 400-1JA01-0AA0", "UR2"
RACK 0, SLOT 1, "6ES7 407-0KA01-0AA0", "PS 407 10A"
RACK 0, SLOT 3, "6ES7 416-2XK02-0AB0" "V7.0", "CPU1_Main"
`;

const SUBSLOT_SNIPPET = `
RACK 0, "6ES7 400-1JA01-0AA0", "UR2"
RACK 0, SLOT 3, "6ES7 416-2XK02-0AB0", "CPU1_Main"
RACK 0, SLOT 3, SUBSLOT 1, "6GK7 443-1EX11-0XE0", "IE Interface"
`;

// ── Tests ──────────────────────────────────────────────────────────────────

describe('PROFINET IOSUBSYSTEM parsing', () => {
  const data = parseStep7Cfg(IOSUBSYSTEM_SNIPPET);

  assert(Array.isArray(data.pnDevices), 'pnDevices is an array');
  assertEqual(data.pnDevices.length, 1, 'one device found');

  const dev = data.pnDevices[0];
  assertEqual(dev.ioSubsystemId, 1,             'ioSubsystemId = 1');
  assertEqual(dev.ioAddress,     5,             'ioAddress = 5');
  assertEqual(dev.slot,          1,             'slot = 1');
  assertEqual(dev.gsdml,         'GSDML-V2.3-Siemens-ET200SP-20150902.xml', 'gsdml matches');
  assertEqual(dev.name,          'ET200SP_Station_1', 'name overridden by NAME inside block');
  assertEqual(dev.assetId,       'ASSET-001',   'assetId extracted');
  assertEqual(dev.mlfb,          '6ES7 155-6AU00-0BN0', 'mlfb extracted');
  assertEqual(dev.mac,           '00 1C 06 1A 2B 3C', 'mac extracted');
  assertEqual(dev.ipHex,         '0A 01 00 05', 'ipHex extracted');
  assertEqual(dev.ip,            '10.1.0.5',    'ip as dotted IPv4');
  assertEqual(dev.subnetMaskHex, 'FF FF FF 00', 'subnetMaskHex extracted');
  assertEqual(dev.subnetMask,    '255.255.255.0', 'subnetMask as dotted IPv4');
  assertEqual(dev.routerHex,     '0A 01 00 01', 'routerHex extracted');
  assertEqual(dev.router,        '10.1.0.1',    'router as dotted IPv4');
  assertEqual(dev.pnSwRelease,   'V4.1',        'pnSwRelease extracted');
  assertEqual(dev.pnHwRelease,   'V1.0',        'pnHwRelease extracted');
  assertEqual(dev.pnMinVersion,  'V2.3',        'pnMinVersion extracted');
  assertEqual(dev.localInAddress, 100,          'localInAddress extracted');
});

describe('Rack parsing — simple slot header (no firmware token)', () => {
  const data = parseStep7Cfg(RACK_SIMPLE_SNIPPET);

  assert(data.rack !== null, 'rack found');
  assertEqual(data.rack.slots.length, 2, 'two slots parsed');

  const slot1 = data.rack.slots[0];
  assertEqual(slot1.slot,          1,                     'slot 1 number');
  assertEqual(slot1.articleNumber, '6ES7 407-0KA01-0AA0', 'slot 1 article number');
  assertEqual(slot1.name,          'PS 407 10A',          'slot 1 name');
  assertEqual(slot1.type,          'PS',                  'slot 1 type = PS');
  assertEqual(slot1.firmware,      undefined,             'slot 1 has no firmware field');

  const slot3 = data.rack.slots[1];
  assertEqual(slot3.slot,          3,                     'slot 3 number');
  assertEqual(slot3.articleNumber, '6ES7 416-2XK02-0AB0', 'slot 3 article number');
  assertEqual(slot3.name,          'CPU1_Main',           'slot 3 name');
  assertEqual(slot3.firmware,      undefined,             'slot 3 has no firmware field');
});

describe('Rack parsing — slot header with optional firmware token', () => {
  const data = parseStep7Cfg(RACK_FIRMWARE_SNIPPET);

  assert(data.rack !== null, 'rack found');
  assertEqual(data.rack.slots.length, 2, 'two slots parsed');

  const slot3 = data.rack.slots[1];
  assertEqual(slot3.slot,          3,                     'slot 3 number');
  assertEqual(slot3.articleNumber, '6ES7 416-2XK02-0AB0', 'slot 3 article number');
  assertEqual(slot3.name,          'CPU1_Main',           'slot 3 name');
  assertEqual(slot3.firmware,      'V7.0',                'slot 3 firmware = V7.0');
  assertEqual(slot3.type,          'CPU',                 'slot 3 type = CPU');
});

describe('Rack parsing — SUBSLOT lines are ignored', () => {
  const data = parseStep7Cfg(SUBSLOT_SNIPPET);

  assertEqual(data.rack.slots.length, 1, 'only one physical slot (SUBSLOT ignored)');
  assertEqual(data.rack.slots[0].slot, 3, 'slot 3 is the physical slot');
});

describe('No regression — empty pnDevices array for files without PROFINET', () => {
  const data = parseStep7Cfg(RACK_SIMPLE_SNIPPET);
  assert(Array.isArray(data.pnDevices),    'pnDevices is always an array');
  assertEqual(data.pnDevices.length, 0,    'empty when no IOSUBSYSTEM present');
});

describe('Robustness — IOSUBSYSTEM with missing optional fields', () => {
  const snippet = `
IOSUBSYSTEM 2, 10, 2, "GSDML-minimal.xml", "minimal-device"
BEGIN
  NAME "MinimalDevice"
END
`;
  let data;
  try {
    data = parseStep7Cfg(snippet);
    assert(true, 'parser does not crash on minimal IOSUBSYSTEM block');
  } catch (e) {
    assert(false, `parser threw: ${e.message}`);
    return;
  }
  assertEqual(data.pnDevices.length, 1, 'one device found');
  const dev = data.pnDevices[0];
  assertEqual(dev.ip,         null, 'ip is null when not present');
  assertEqual(dev.subnetMask, null, 'subnetMask is null when not present');
  assertEqual(dev.mac,        null, 'mac is null when not present');
  assertEqual(dev.mlfb,       null, 'mlfb is null when not present');
});

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n──────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
