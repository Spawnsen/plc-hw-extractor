/**
 * step7-parser.js — STEP 7 .cfg file parser
 *
 * Parses a Siemens STEP 7 .cfg configuration file and returns a structured
 * JavaScript object containing station info, subnets, rack, DP slaves, and
 * all I/O signals.
 */

'use strict';

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parses a STEP 7 .cfg file text.
 *
 * @param {string} text - Raw text content of the .cfg file.
 * @returns {Object} Parsed data structure.
 */
function parseStep7Cfg(text) {
  const lines = text.split(/\r?\n/);
  const result = {
    meta:     _parseMeta(lines),
    station:  _parseStation(lines),
    subnets:  _parseSubnets(lines),
    rack:     _parseRack(lines),
    dpSlaves: _parseDpSlaves(lines),
    signals:  [],
  };

  // Derive flat signal list from DP slaves
  result.signals = _buildSignalList(result.dpSlaves);

  return result;
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

/**
 * Extracts file metadata from the header lines.
 * STEP 7 .cfg files use the format:
 *   FILEVERSION "3.2"
 *   #STEP7_VERSION V5.7 + SP4
 *   #CREATED "Donnerstag, 5. März 2026   19:43:17"
 *
 * @param {string[]} lines
 * @returns {Object}
 */
function _parseMeta(lines) {
  const meta = {
    fileVersion:  null,
    step7Version: null,
    created:      null,
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let m;
    // FILEVERSION "3.2"
    if ((m = trimmed.match(/^FILEVERSION\s+"([^"]*)"/i))) {
      meta.fileVersion = m[1];
    }
    // #STEP7_VERSION V5.7 + SP4
    else if ((m = trimmed.match(/^#STEP7_VERSION\s+(.+)/i))) {
      meta.step7Version = m[1].trim();
    }
    // #CREATED "Donnerstag, 5. März 2026   19:43:17"
    else if ((m = trimmed.match(/^#CREATED\s+"([^"]*)"/i))) {
      meta.created = m[1];
    }
    // Stop at first real block keyword
    else if (/^(STATION|SUBNET|RACK|DPSUBSYSTEM)\b/i.test(trimmed)) {
      break;
    }
  }

  return meta;
}

// ─── Station ─────────────────────────────────────────────────────────────────

/**
 * Extracts station info from the STATION block.
 * @param {string[]} lines
 * @returns {Object}
 */
function _parseStation(lines) {
  const station = { type: null, name: null, assetId: null };
  let inStation = false;
  let depth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect station block header: STATION <type> [, "<name>"]
    if (!inStation) {
      const m = trimmed.match(/^STATION\s+(\w+)(?:\s*,\s*"([^"]*)")?/i);
      if (m) {
        station.type = m[1] || null;
        station.name = m[2] || null;
        inStation = true;
        depth = 0;
        continue;
      }
    }

    if (!inStation) continue;

    if (/^BEGIN\b/i.test(trimmed)) { depth++; continue; }
    if (/^END\b/i.test(trimmed) && !trimmed.match(/^END_/i)) {
      depth--;
      if (depth <= 0) break;
      continue;
    }

    // Inside station block
    let m;
    if ((m = trimmed.match(/^NAME\s+"([^"]*)"/i)))      station.name    = m[1];
    if ((m = trimmed.match(/^ASSET_ID\s+"([^"]*)"/i)))  station.assetId = m[1];
  }

  return station;
}

// ─── Subnets ─────────────────────────────────────────────────────────────────

/**
 * Extracts all SUBNET blocks.
 * @param {string[]} lines
 * @returns {Array}
 */
function _parseSubnets(lines) {
  const subnets = [];
  let current = null;
  let inBlock = false;
  let depth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inBlock) {
      // SUBNET <TYPE> [, "<name>"]  or  SUBNET "<name>"
      const m = trimmed.match(/^SUBNET\s+(\w+)(?:\s*,\s*"([^"]*)")?/i);
      if (m) {
        current = { type: m[1], name: m[2] || null, netId: null, baudrate: null };
        inBlock = true;
        depth = 0;
        continue;
      }
    }

    if (!inBlock || !current) continue;

    if (/^BEGIN\b/i.test(trimmed)) { depth++; continue; }
    if (/^END\b/i.test(trimmed) && !trimmed.match(/^END_/i)) {
      depth--;
      if (depth <= 0) {
        subnets.push(current);
        current = null;
        inBlock = false;
      }
      continue;
    }

    let m;
    if ((m = trimmed.match(/^NAME\s+"([^"]*)"/i)))    current.name     = m[1];
    if ((m = trimmed.match(/^NET_ID\s+"([^"]*)"/i)))  current.netId    = m[1];
    if ((m = trimmed.match(/^BAUDRATE\s+"([^"]*)"/i))) current.baudrate = m[1];
  }

  return subnets;
}

// ─── Rack ─────────────────────────────────────────────────────────────────────

/**
 * Extracts the first RACK block.
 * Handles both the rack base line and per-slot top-level entries:
 *   RACK 0, "6ES7 400-1JA01-0AA0", "UR2"
 *   RACK 0, SLOT 1, "6ES7 407-0KA01-0AA0", "PS 407 10A"
 * @param {string[]} lines
 * @returns {Object|null}
 */
function _parseRack(lines) {
  let rack = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Match rack base: RACK 0, "6ES7 400-1JA01-0AA0", "UR2"
    // (no SLOT keyword, no SUBSLOT keyword)
    const rackBaseMatch = trimmed.match(/^RACK\s+(\d+)\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*$/i);
    if (rackBaseMatch && !rack) {
      rack = {
        rackNo:        parseInt(rackBaseMatch[1], 10),
        articleNumber: rackBaseMatch[2],
        name:          rackBaseMatch[3],
        slots:         [],
      };
      continue;
    }

    // Match slot: RACK 0, SLOT 3, "6ES7 416-2XK02-0AB0", "CPU1_Main"
    // Must NOT contain SUBSLOT
    const slotMatch = trimmed.match(/^RACK\s+(\d+)\s*,\s*SLOT\s+(\d+)\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*$/i);
    if (slotMatch) {
      if (!rack) {
        rack = { rackNo: parseInt(slotMatch[1], 10), articleNumber: null, name: null, slots: [] };
      }
      const articleNumber = slotMatch[3];
      rack.slots.push({
        slot:          parseInt(slotMatch[2], 10),
        articleNumber: articleNumber,
        name:          slotMatch[4],
        type:          _detectSlotType(articleNumber),
      });
      continue;
    }

    // SUBSLOT lines — skip them (they are sub-interfaces, not physical slots)
    if (/^RACK\s+\d+\s*,\s*SLOT\s+\d+\s*,\s*SUBSLOT\b/i.test(trimmed)) {
      continue;
    }
  }

  return rack;
}

// ─── Slot type detection config ──────────────────────────────────────────────

/** Maps article number regex patterns to slot type strings (first match wins). */
const SLOT_TYPE_PATTERNS = [
  { pattern: /^6ES7\s+407/i, type: 'PS'  },
  { pattern: /^6ES7\s+4[01]\d/i, type: 'CPU' },
  { pattern: /^6GK/i,            type: 'CP'  },
  { pattern: /^6ES7/i,           type: 'SM'  },
];

/**
 * Detects the slot type from article number prefix.
 * @param {string|null} articleNumber
 * @returns {string}
 */
function _detectSlotType(articleNumber) {
  if (!articleNumber) return 'unknown';
  const a = articleNumber.trim();
  const match = SLOT_TYPE_PATTERNS.find(({ pattern }) => pattern.test(a));
  return match ? match.type : 'unknown';
}

// ─── DP Slaves ────────────────────────────────────────────────────────────────

/**
 * Extracts all DP slave blocks and their slots from top-level DPSUBSYSTEM lines.
 * Three line types are distinguished:
 *   Mastersystem: DPSUBSYSTEM 1, "PROFIBUS HG1: DP-Mastersystem (1)"  — skipped
 *   Slave header: DPSUBSYSTEM 1, DPADDRESS 3, "DP2V0550.GSD", "SS0001"
 *   Slot header:  DPSUBSYSTEM 1, DPADDRESS 3, SLOT 0, "221-1BF00  DI8xDC24V", "8DE"
 * @param {string[]} lines
 * @returns {Array}
 */
function _parseDpSlaves(lines) {
  const slaves = [];
  const slaveMap = {}; // key: dpAddress -> slave object

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // ── Slave header: DPSUBSYSTEM 1, DPADDRESS 3, "DP2V0550.GSD", "SS0001"
    // Must have DPADDRESS but NOT SLOT
    const slaveMatch = trimmed.match(
      /^DPSUBSYSTEM\s+\d+\s*,\s*DPADDRESS\s+(\d+)\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*$/i
    );
    if (slaveMatch) {
      const dpAddr  = parseInt(slaveMatch[1], 10);
      const gsdFile = slaveMatch[2];
      const name    = slaveMatch[3];
      const slave = {
        dpAddress: dpAddr,
        gsdFile:   gsdFile,
        name:      name,
        assetId:   null,
        slots:     [],
      };
      slaveMap[dpAddr] = slave;
      slaves.push(slave);

      // Read ASSET_ID from the BEGIN...END block following this header
      i = _readSlaveProperties(lines, i + 1, slave);
      continue;
    }

    // ── Slot header: DPSUBSYSTEM 1, DPADDRESS 3, SLOT 0, "221-1BF00  DI8xDC24V", "8DE"
    const slotMatch = trimmed.match(
      /^DPSUBSYSTEM\s+\d+\s*,\s*DPADDRESS\s+(\d+)\s*,\s*SLOT\s+(\d+)\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*$/i
    );
    if (slotMatch) {
      const dpAddr     = parseInt(slotMatch[1], 10);
      const slotNo     = parseInt(slotMatch[2], 10);
      const moduleType = slotMatch[3];
      const moduleName = slotMatch[4];

      const slotObj = {
        slot:        slotNo,
        moduleType:  moduleType,
        moduleName:  moduleName,
        direction:   null,
        byteAddress: null,
        signals:     [],
      };

      // Read the BEGIN...END block for this slot
      i = _readSlotBlock(lines, i + 1, slotObj);

      // Attach to slave
      if (slaveMap[dpAddr]) {
        slaveMap[dpAddr].slots.push(slotObj);
      }
      continue;
    }
  }

  return slaves;
}

/**
 * Reads properties (ASSET_ID etc.) from a BEGIN...END block.
 * Returns the line index of the END line.
 * @param {string[]} lines
 * @param {number} startIdx
 * @param {Object} slave
 * @returns {number}
 */
function _readSlaveProperties(lines, startIdx, slave) {
  let i = startIdx;
  let inBlock = false;

  for (; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (/^BEGIN\b/i.test(trimmed)) { inBlock = true; continue; }
    if (/^END\b/i.test(trimmed) && !trimmed.match(/^END_/i)) {
      return i;
    }

    if (!inBlock) continue;

    let m;
    if ((m = trimmed.match(/^ASSET_ID\s+"([^"]*)"/i))) slave.assetId = m[1];
  }

  return i;
}

/**
 * Reads a slot BEGIN...END block, extracting signals and addresses.
 * Returns the line index of the END line.
 * @param {string[]} lines
 * @param {number} startIdx
 * @param {Object} slotObj
 * @returns {number}
 */
function _readSlotBlock(lines, startIdx, slotObj) {
  let i = startIdx;
  let inBlock = false;
  let pendingAddressType = null;
  let inLocalAddresses = false;

  for (; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (/^BEGIN\b/i.test(trimmed)) { inBlock = true; continue; }
    if (/^END\b/i.test(trimmed) && !trimmed.match(/^END_/i)) {
      return i;
    }

    if (!inBlock) continue;

    let m;

    // LOCAL_IN_ADDRESSES / LOCAL_OUT_ADDRESSES
    if (/^LOCAL_IN_ADDRESSES\b/i.test(trimmed)) {
      pendingAddressType = 'IN';
      inLocalAddresses = true;
      continue;
    }
    if (/^LOCAL_OUT_ADDRESSES\b/i.test(trimmed)) {
      pendingAddressType = 'OUT';
      inLocalAddresses = true;
      continue;
    }

    // ADDRESS line inside LOCAL_*_ADDRESSES:
    // ADDRESS  0, 0, 1, 0, 2, 0  → first number is byte address
    if (inLocalAddresses && (m = trimmed.match(/^ADDRESS\s+(\d+)/i))) {
      if (slotObj.byteAddress === null) {
        slotObj.byteAddress = parseInt(m[1], 10);
        slotObj.direction   = pendingAddressType;
      }
      inLocalAddresses = false;
      continue;
    }
    if (inLocalAddresses && trimmed && !/^\d/.test(trimmed)) {
      inLocalAddresses = false;
    }

    // SYMBOL  I , 0, "SS0001_24V_iO", ""
    // SYMBOL  O , 0, "Freig_an_RBG11", ""
    if ((m = trimmed.match(/^SYMBOL\s+(I|O)\s*,\s*(\d+)\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"/i))) {
      const sigType    = m[1].toUpperCase();
      const bitNo      = parseInt(m[2], 10);
      const sigName    = m[3];
      const sigComment = m[4];

      if (!slotObj.direction) {
        slotObj.direction = sigType === 'I' ? 'IN' : 'OUT';
      }

      slotObj.signals.push({
        bit:     bitNo,
        type:    sigType,
        name:    sigName,
        comment: sigComment,
      });
      continue;
    }
  }

  return i;
}

// ─── Signal List ─────────────────────────────────────────────────────────────

/**
 * Builds a flat signal list from all DP slave slots.
 * @param {Array} dpSlaves
 * @returns {Array}
 */
function _buildSignalList(dpSlaves) {
  const signals = [];

  for (const slave of dpSlaves) {
    for (const slot of slave.slots) {
      for (const sig of slot.signals) {
        signals.push({
          slaveName:   slave.name   || `DP${slave.dpAddress}`,
          slaveAddress: slave.dpAddress,
          module:       slot.moduleType || slot.moduleName || '',
          slot:         slot.slot,
          type:         sig.type,
          byteAddress:  slot.byteAddress !== null ? slot.byteAddress : null,
          bit:          sig.bit,
          symbolName:   sig.name,
          comment:      sig.comment,
        });
      }
    }
  }

  return signals;
}

// ─── Export ──────────────────────────────────────────────────────────────────

window.Step7Parser = { parseStep7Cfg };
