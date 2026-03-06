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
IOSUBSYSTEM 100, "PN: PROFINET-IO-System (100)"
BEGIN
END
IOSUBSYSTEM 100, IOADDRESS 20, "GSDML-V2.3-Siemens-ET200SP-20150902.xml", "et200sp-device"
BEGIN
  NAME "ET200SP_Station_1"
  ASSET_ID "ASSET-001"
  MACADDRESS 00 1C 06 1A 2B 3C
  IPADDRESS 0A 01 00 05
  SUBNETMASK FF FF FF 00
  ROUTERADDRESS 0A 01 00 01
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

describe('PROFINET IOSUBSYSTEM parsing (IOADDRESS format)', () => {
  const data = parseStep7Cfg(IOSUBSYSTEM_SNIPPET);

  assertEqual(data.pnDevices.length, 0, 'pnDevices is always empty (legacy parser disabled)');
  assert(Array.isArray(data.profinet.devices), 'profinet.devices is an array');
  assertEqual(data.profinet.devices.length, 1, 'one device found');

  const dev = data.profinet.devices[0];
  assertEqual(dev.systemId,    100,                                      'systemId = 100');
  assertEqual(dev.ioAddress,    20,                                      'ioAddress = 20');
  assertEqual(dev.gsdml, 'GSDML-V2.3-Siemens-ET200SP-20150902.xml',     'gsdml matches');
  assertEqual(dev.name,  'ET200SP_Station_1', 'name overridden by NAME inside block');
  assertEqual(dev.assetId,     'ASSET-001',   'assetId extracted');
  assertEqual(dev.mac,         '00 1C 06 1A 2B 3C', 'mac extracted');
  assertEqual(dev.ip,          '10.1.0.5',    'ip as dotted IPv4');
  assertEqual(dev.subnetMask,  '255.255.255.0', 'subnetMask as dotted IPv4');
  assertEqual(dev.router,      '10.1.0.1',    'router as dotted IPv4');
  assertEqual(dev.diagAddress, 100,           'diagAddress extracted from LOCAL_IN_ADDRESSES');
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
IOSUBSYSTEM 100, IOADDRESS 10, "GSDML-minimal.xml", "minimal-device"
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
  assertEqual(data.profinet.devices.length, 1, 'one device found');
  const dev = data.profinet.devices[0];
  assertEqual(dev.ip,         null, 'ip is null when not present');
  assertEqual(dev.subnetMask, null, 'subnetMask is null when not present');
  assertEqual(dev.mac,        null, 'mac is null when not present');
  assertEqual(dev.assetId,    null, 'assetId is null when not present');
  assertEqual(dev.diagAddress, null, 'diagAddress is null when not present');
});

// ── New-format PROFINET (IOADDRESS keyword) ────────────────────────────────

const PN_SYSTEM_SNIPPET = `
IOSUBSYSTEM 100, "PN: PROFINET-IO-System (100)"
BEGIN
END
`;

describe('Profinet — system header detection', () => {
  const data = parseStep7Cfg(PN_SYSTEM_SNIPPET);
  assert(data.profinet !== undefined,             'profinet key exists');
  assert(Array.isArray(data.profinet.systems),   'profinet.systems is an array');
  assertEqual(data.profinet.systems.length, 1,   'one system found');
  assertEqual(data.profinet.systems[0].id,   100, 'system id = 100');
  assertEqual(data.profinet.systems[0].name, 'PN: PROFINET-IO-System (100)', 'system name');
  assert(Array.isArray(data.profinet.devices),   'profinet.devices is an array');
  assertEqual(data.profinet.devices.length,  0,  'no devices (only system header)');
});

const PN_DEVICES_SNIPPET = `
IOSUBSYSTEM 100, "PN: PROFINET-IO-System (100)"
BEGIN
END
IOSUBSYSTEM 100, IOADDRESS 20, "GSDML-V2.33-ACME-kf5075-20220301.xml", "kf5075"
BEGIN
  NAME "kf5075_Station"
  IPADDRESS 0A 01 00 14
  MACADDRESS 00 1A 2B 3C 4D 5E
  SUBNETMASK FF FF FF 00
  ROUTERADDRESS 0A 01 00 01
END
IOSUBSYSTEM 100, IOADDRESS 21, "GSDML-V2.33-ACME-ET200SP-20220301.xml", "ET200SP_1"
BEGIN
  NAME "ET200SP_Station"
END
IOSUBSYSTEM 100, IOADDRESS 20, SLOT 0, SUBSLOT 1, "...", "Ethernet Interface"
BEGIN
END
IOSUBSYSTEM 100, IOADDRESS 20, SLOT 0, SUBSLOT 2, "...", "Port 1"
BEGIN
END
`;

describe('Profinet — devices at IOADDRESS level', () => {
  const data = parseStep7Cfg(PN_DEVICES_SNIPPET);
  assertEqual(data.profinet.devices.length, 2, 'two devices (one per IOADDRESS)');

  const dev = data.profinet.devices[0];
  assertEqual(dev.systemId,   100,                                       'systemId = 100');
  assertEqual(dev.ioAddress,   20,                                       'ioAddress = 20');
  assertEqual(dev.gsdml, 'GSDML-V2.33-ACME-kf5075-20220301.xml',        'gsdml extracted');
  assertEqual(dev.name,  'kf5075_Station',                               'name overridden by NAME in block');
  assertEqual(dev.ip,    '10.1.0.20',                                    'ip as dotted IPv4');
  assertEqual(dev.mac,   '00 1A 2B 3C 4D 5E',                           'mac extracted');
  assertEqual(dev.subnetMask, '255.255.255.0',                           'subnetMask extracted');
  assertEqual(dev.router, '10.1.0.1',                                    'router extracted');

  const dev2 = data.profinet.devices[1];
  assertEqual(dev2.ioAddress, 21, 'second device ioAddress = 21');
  assertEqual(dev2.name, 'ET200SP_Station', 'second device name');
});

describe('Profinet — participant count ignores SUBSLOT entries', () => {
  const data = parseStep7Cfg(PN_DEVICES_SNIPPET);
  // SUBSLOT lines must not inflate the device count
  assertEqual(data.profinet.devices.length, 2, 'SUBSLOT lines do not create extra participants');
});

const PN_SLOT_SIGNALS_SNIPPET = `
IOSUBSYSTEM 100, IOADDRESS 20, "GSDML-V2.33-ACME-kf5075-20220301.xml", "kf5075"
BEGIN
END
IOSUBSYSTEM 100, IOADDRESS 20, SLOT 5, "6ES7 131-6BF01-0BA0", "DI8"
BEGIN
  LOCAL_IN_ADDRESSES
  BEGIN
    ADDRESS 32, 0, 1, 0, 0, 0
  END
  SYMBOL  I , 0, "kf5075_DI0", "Sensor 0"
  SYMBOL  I , 1, "kf5075_DI1", "Sensor 1"
END
`;

describe('Profinet — slot with LOCAL_IN_ADDRESSES and SYMBOL I/O produces signals', () => {
  const data = parseStep7Cfg(PN_SLOT_SIGNALS_SNIPPET);
  assertEqual(data.profinet.devices.length, 1, 'one PN device');

  const dev = data.profinet.devices[0];
  assertEqual(dev.slots.length,        1,    'one slot attached');
  assertEqual(dev.modulesCount,        1,    'modulesCount = 1');

  const slot = dev.slots[0];
  assertEqual(slot.slot,          5,             'slot number = 5');
  assertEqual(slot.byteAddress,  32,             'byteAddress from LOCAL_IN_ADDRESSES');
  assertEqual(slot.direction,   'IN',            'direction = IN');
  assertEqual(slot.signals.length, 2,            'two signals');
  assertEqual(slot.signals[0].name,    'kf5075_DI0', 'first signal name');
  assertEqual(slot.signals[0].comment, 'Sensor 0',   'first signal comment');
  assertEqual(slot.signals[0].type,    'I',           'first signal type');
  assertEqual(slot.signals[1].bit,     1,             'second signal bit = 1');

  // Signals should also appear in dev.signals
  assertEqual(dev.signals.length, 2, 'two signals in dev.signals');
  assertEqual(dev.signals[0].ioAddress,  20,          'signal ioAddress = 20');
  assertEqual(dev.signals[0].pnSystemId, 100,         'signal pnSystemId = 100');
  assertEqual(dev.signals[0].symbolName, 'kf5075_DI0', 'signal symbolName');
});

describe('Profinet — bare slot (no module/name on header line)', () => {
  const snippet = `
IOSUBSYSTEM 100, IOADDRESS 20, "GSDML.xml", "dev"
BEGIN
END
IOSUBSYSTEM 100, IOADDRESS 20, SLOT 0
BEGIN
END
`;
  const data = parseStep7Cfg(snippet);
  assertEqual(data.profinet.devices[0].slots.length, 1, 'bare slot is still attached');
  assertEqual(data.profinet.devices[0].modulesCount, 1, 'bare slot increments modulesCount');
});

describe('Profinet — empty profinet for file without IOSUBSYSTEM IOADDRESS blocks', () => {
  const data = parseStep7Cfg(RACK_SIMPLE_SNIPPET);
  assert(data.profinet !== undefined,            'profinet key always present');
  assertEqual(data.profinet.systems.length, 0,  'no systems');
  assertEqual(data.profinet.devices.length, 0,  'no devices');
});

// ── Bug 2: Quoted hex IP format ────────────────────────────────────────────

const PN_QUOTED_HEX_SNIPPET = `
IOSUBSYSTEM 100, "PN: PROFINET-IO-System (100)"
BEGIN
END
IOSUBSYSTEM 100, IOADDRESS 20, "GSDML-V2.33-ACME-kf5075-20220301.xml", "kf5075"
BEGIN
  NAME "kf5075_Station"
  ASSET_ID "ASSET-HG14-001"
  IPADDRESS "C0A80014"
  SUBNETMASK "FFFFFF00"
  ROUTERADDRESS "C0A80101"
  MACADDRESS "080006010000"
  LOCAL_IN_ADDRESSES
  BEGIN
    ADDRESS 16300, 0, 0, 0, 2, 0
  END
END
`;

describe('Profinet — quoted compact hex IP/MAC/subnet/router (STEP 7 v5.6+ format)', () => {
  const data = parseStep7Cfg(PN_QUOTED_HEX_SNIPPET);
  assertEqual(data.profinet.devices.length, 1, 'one device found');

  const dev = data.profinet.devices[0];
  assertEqual(dev.ip,          '192.168.0.20',   'ip from quoted hex "C0A80014"');
  assertEqual(dev.subnetMask,  '255.255.255.0',  'subnetMask from quoted hex "FFFFFF00"');
  assertEqual(dev.router,      '192.168.1.1',    'router from quoted hex "C0A80101"');
  assertEqual(dev.mac,         '080006010000',   'mac from quoted hex stored as-is');
  assertEqual(dev.assetId,     'ASSET-HG14-001', 'assetId extracted');
  assertEqual(dev.diagAddress, 16300,            'diagAddress from LOCAL_IN_ADDRESSES');
});

// ── Bug 1: DP slave diagAddress ────────────────────────────────────────────

const DP_DIAG_SNIPPET = `
DPSUBSYSTEM 1, "PROFIBUS HG1: DP-Mastersystem (1)"
BEGIN
END
DPSUBSYSTEM 1, DPADDRESS 3, "DP2V0550.GSD", "14LS0110"
BEGIN
  ASSET_ID "SLAVE-003"
  LOCAL_IN_ADDRESSES
    ADDRESS  16381, 0, 0, 0, 2, 0
END
DPSUBSYSTEM 1, DPADDRESS 4, "DP2V0550.GSD", "14BP0111"
BEGIN
  ASSET_ID "SLAVE-004"
  LOCAL_IN_ADDRESSES
  BEGIN
    ADDRESS  16380, 0, 0, 0, 2, 0
  END
END
`;

describe('DP slave — diagAddress from LOCAL_IN_ADDRESSES (Bug 1)', () => {
  const data = parseStep7Cfg(DP_DIAG_SNIPPET);
  assertEqual(data.dpSlaves.length, 2, 'two DP slaves found');

  const s1 = data.dpSlaves[0];
  assertEqual(s1.name,        '14LS0110', 'slave 1 name');
  assertEqual(s1.assetId,     'SLAVE-003', 'slave 1 assetId');
  assertEqual(s1.diagAddress, 16381,       'slave 1 diagAddress (bare ADDRESS)');
  assertEqual(s1.dpSubsystem, 1,           'slave 1 dpSubsystem');

  const s2 = data.dpSlaves[1];
  assertEqual(s2.name,        '14BP0111', 'slave 2 name');
  assertEqual(s2.diagAddress, 16380,       'slave 2 diagAddress (nested BEGIN/END)');
});

// ── Bug 3: dpSubsystem composite key ──────────────────────────────────────

const DP_MULTI_SUBSYSTEM_SNIPPET = `
DPSUBSYSTEM 1, DPADDRESS 3, "DP2V0550.GSD", "Slave1_Sub1"
BEGIN
END
DPSUBSYSTEM 1, DPADDRESS 3, SLOT 0, "221-1BF00  DI8xDC24V", "DI8"
BEGIN
  LOCAL_IN_ADDRESSES
  BEGIN
    ADDRESS 10, 0, 1, 0, 0, 0
  END
  SYMBOL  I , 0, "Slave1_Sub1_DI0", "Signal A"
END
DPSUBSYSTEM 2, DPADDRESS 3, "DP2V0550.GSD", "Slave1_Sub2"
BEGIN
END
DPSUBSYSTEM 2, DPADDRESS 3, SLOT 0, "221-1BF00  DI8xDC24V", "DI8"
BEGIN
  LOCAL_IN_ADDRESSES
  BEGIN
    ADDRESS 20, 0, 1, 0, 0, 0
  END
  SYMBOL  I , 0, "Slave1_Sub2_DI0", "Signal B"
END
`;

describe('DP slaves — composite dpSubsystem_dpAddress key prevents collision (Bug 3)', () => {
  const data = parseStep7Cfg(DP_MULTI_SUBSYSTEM_SNIPPET);
  assertEqual(data.dpSlaves.length, 2, 'two separate slaves for same dpAddress in different subsystems');

  const s1 = data.dpSlaves.find(s => s.dpSubsystem === 1);
  const s2 = data.dpSlaves.find(s => s.dpSubsystem === 2);

  assert(s1 !== undefined, 'slave in dpSubsystem 1 found');
  assert(s2 !== undefined, 'slave in dpSubsystem 2 found');

  assertEqual(s1.name,        'Slave1_Sub1', 'slave in subsystem 1 name');
  assertEqual(s1.dpSubsystem, 1,             'slave 1 dpSubsystem = 1');
  assertEqual(s1.dpAddress,   3,             'slave 1 dpAddress = 3');
  assertEqual(s1.slots.length, 1,            'slave 1 has one slot');
  assertEqual(s1.slots[0].signals[0].name, 'Slave1_Sub1_DI0', 'slot assigned to correct slave (sub 1)');

  assertEqual(s2.name,        'Slave1_Sub2', 'slave in subsystem 2 name');
  assertEqual(s2.dpSubsystem, 2,             'slave 2 dpSubsystem = 2');
  assertEqual(s2.slots.length, 1,            'slave 2 has one slot');
  assertEqual(s2.slots[0].signals[0].name, 'Slave1_Sub2_DI0', 'slot assigned to correct slave (sub 2)');
});

describe('DP signals — dpSubsystem propagated to signal list (Bug 3)', () => {
  const data = parseStep7Cfg(DP_MULTI_SUBSYSTEM_SNIPPET);
  assertEqual(data.signals.length, 2, 'two signals total');

  const sig1 = data.signals.find(s => s.symbolName === 'Slave1_Sub1_DI0');
  const sig2 = data.signals.find(s => s.symbolName === 'Slave1_Sub2_DI0');

  assert(sig1 !== undefined, 'signal for subsystem 1 found');
  assertEqual(sig1.dpSubsystem, 1, 'signal 1 dpSubsystem = 1');

  assert(sig2 !== undefined, 'signal for subsystem 2 found');
  assertEqual(sig2.dpSubsystem, 2, 'signal 2 dpSubsystem = 2');
});

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n──────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
