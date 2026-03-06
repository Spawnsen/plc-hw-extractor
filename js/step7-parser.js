/**
 * step7-parser.js — STEP 7 .cfg file parser
 *
 * Parses a Siemens STEP 7 .cfg configuration file and returns a structured
 * JavaScript object containing station info, subnets, rack, DP slaves,
 * PROFINET IO devices (IOSUBSYSTEM), and all I/O signals.
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
    meta:      _parseMeta(lines),
    station:   _parseStation(lines),
    subnets:   _parseSubnets(lines),
    rack:      _parseRack(lines),
    dpSlaves:  _parseDpSlaves(lines),
    pnDevices: _parsePnDevices(lines),
    profinet:  _parseProfinet(lines),
    signals:   [],
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
    //        or: RACK 0, SLOT 3, "6ES7 416-2XK02-0AB0" "V7.0", "CPU1_Main"  (optional firmware token)
    // Must NOT contain SUBSLOT
    const slotMatch = trimmed.match(/^RACK\s+(\d+)\s*,\s*SLOT\s+(\d+)\s*,\s*"([^"]*)"\s*(?:"([^"]*)")?\s*,\s*"([^"]*)"\s*$/i);
    if (slotMatch) {
      if (!rack) {
        rack = { rackNo: parseInt(slotMatch[1], 10), articleNumber: null, name: null, slots: [] };
      }
      const articleNumber = slotMatch[3];
      const slotEntry = {
        slot:          parseInt(slotMatch[2], 10),
        articleNumber: articleNumber,
        name:          slotMatch[5],
        type:          _detectSlotType(articleNumber),
      };
      if (slotMatch[4]) slotEntry.firmware = slotMatch[4];
      rack.slots.push(slotEntry);
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
 * Uses a depth counter to correctly handle nested BEGIN...END pairs
 * (e.g. the LOCAL_IN/OUT_ADDRESSES sub-block).
 * Returns the line index of the outer END line.
 * @param {string[]} lines
 * @param {number} startIdx
 * @param {Object} slotObj
 * @returns {number}
 */
function _readSlotBlock(lines, startIdx, slotObj) {
  let i = startIdx;
  let depth = 0;
  let pendingAddressType = null;
  let inLocalAddresses = false;

  for (; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (/^BEGIN\b/i.test(trimmed)) {
      depth++;
      continue;
    }
    if (/^END\b/i.test(trimmed) && !/^END_/i.test(trimmed)) {
      depth--;
      if (depth === 0) return i;      // outer block closed — done
      if (depth === 1) inLocalAddresses = false; // exited nested sub-block
      continue;
    }

    if (depth < 1) continue; // before outer BEGIN

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
      continue;
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

// ─── PROFINET IO (IOSUBSYSTEM) ────────────────────────────────────────────────

/**
 * Converts a hex byte string (e.g. "0A 01 00 05") to dotted IPv4 notation.
 * Returns null if the input is falsy or doesn't have exactly 4 bytes.
 * @param {string|null} hexStr
 * @returns {string|null}
 */
function _hexBytesToIp(hexStr) {
  if (!hexStr) return null;
  const parts = hexStr.trim().split(/\s+/);
  if (parts.length !== 4) return null;
  return parts.map(b => parseInt(b, 16)).join('.');
}

/**
 * Extracts all IOSUBSYSTEM blocks (PROFINET IO devices).
 * Header format:
 *   IOSUBSYSTEM <ioSubsystemId>, <ioAddress>, <slot>, "<gsdml>", "<name>"
 * Block content (BEGIN...END) may contain:
 *   NAME, ASSET_ID, MLFB, MACADDRESS, IPADDRESS, SUBNETMASK, ROUTERADDRESS,
 *   PN_SW_RELEASE, PN_HW_RELEASE, PN_MIN_VERSION, LOCAL_IN_ADDRESSES/ADDRESS
 * @param {string[]} lines
 * @returns {Array}
 */
function _parsePnDevices(lines) {
  const devices = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // IOSUBSYSTEM header: IOSUBSYSTEM <id>, <addr>, <slot>, "<gsdml>", "<name>"
    const headerMatch = trimmed.match(
      /^IOSUBSYSTEM\s+(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"/i
    );
    if (!headerMatch) continue;

    const device = {
      ioSubsystemId: parseInt(headerMatch[1], 10),
      ioAddress:     parseInt(headerMatch[2], 10),
      slot:          parseInt(headerMatch[3], 10),
      gsdml:         headerMatch[4],
      name:          headerMatch[5],
      assetId:       null,
      mlfb:          null,
      mac:           null,
      ipHex:         null,
      ip:            null,
      subnetMaskHex: null,
      subnetMask:    null,
      routerHex:     null,
      router:        null,
      pnSwRelease:   null,
      pnHwRelease:   null,
      pnMinVersion:  null,
      localInAddress: null,
    };

    // Read the BEGIN...END block
    i = _readPnDeviceBlock(lines, i + 1, device);
    devices.push(device);
  }

  return devices;
}

/**
 * Reads an IOSUBSYSTEM BEGIN...END block, populating the device object.
 * Returns the line index of the END line.
 * @param {string[]} lines
 * @param {number} startIdx
 * @param {Object} device
 * @returns {number}
 */
function _readPnDeviceBlock(lines, startIdx, device) {
  let i = startIdx;
  let inBlock = false;
  let inLocalInAddr = false;

  for (; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (/^BEGIN\b/i.test(trimmed)) { inBlock = true; continue; }
    if (/^END\b/i.test(trimmed) && !trimmed.match(/^END_/i)) {
      return i;
    }

    if (!inBlock) continue;

    let m;
    if ((m = trimmed.match(/^NAME\s+"([^"]*)"/i)))           device.name         = m[1];
    if ((m = trimmed.match(/^ASSET_ID\s+"([^"]*)"/i)))       device.assetId      = m[1];
    if ((m = trimmed.match(/^MLFB\s+"([^"]*)"/i)))           device.mlfb         = m[1];
    if ((m = trimmed.match(/^MACADDRESS\s+([0-9A-Fa-f ]+)/i))) device.mac        = m[1].trim();
    if ((m = trimmed.match(/^PN_SW_RELEASE\s+"([^"]*)"/i)))  device.pnSwRelease  = m[1];
    if ((m = trimmed.match(/^PN_HW_RELEASE\s+"([^"]*)"/i)))  device.pnHwRelease  = m[1];
    if ((m = trimmed.match(/^PN_MIN_VERSION\s+"([^"]*)"/i))) device.pnMinVersion = m[1];

    if ((m = trimmed.match(/^IPADDRESS\s+([0-9A-Fa-f ]+)/i))) {
      device.ipHex = m[1].trim();
      device.ip    = _hexBytesToIp(device.ipHex);
    }
    if ((m = trimmed.match(/^SUBNETMASK\s+([0-9A-Fa-f ]+)/i))) {
      device.subnetMaskHex = m[1].trim();
      device.subnetMask    = _hexBytesToIp(device.subnetMaskHex);
    }
    if ((m = trimmed.match(/^ROUTERADDRESS\s+([0-9A-Fa-f ]+)/i))) {
      device.routerHex = m[1].trim();
      device.router    = _hexBytesToIp(device.routerHex);
    }

    // Track LOCAL_IN_ADDRESSES block to pick up the first ADDRESS
    if (/^LOCAL_IN_ADDRESSES\b/i.test(trimmed)) {
      inLocalInAddr = true;
      continue;
    }
    if (inLocalInAddr && (m = trimmed.match(/^ADDRESS\s+(\d+)/i))) {
      if (device.localInAddress === null) {
        device.localInAddress = parseInt(m[1], 10);
      }
      inLocalInAddr = false;
      continue;
    }
    if (inLocalInAddr && trimmed && !/^\d/.test(trimmed) && !/^BEGIN\b/i.test(trimmed) && !/^END\b/i.test(trimmed)) {
      inLocalInAddr = false;
    }
  }

  return i;
}

// ─── PROFINET Participants (IOSUBSYSTEM with IOADDRESS keyword) ───────────────

/**
 * Parses IOSUBSYSTEM blocks that use the IOADDRESS keyword format.
 * This is the real PROFINET export format used in STEP 7 cfg files.
 *
 * Recognized header variants:
 *   System:  IOSUBSYSTEM 100, "PN: PROFINET-IO-System (100)"
 *   Device:  IOSUBSYSTEM 100, IOADDRESS 20, "GSDML-...", "kf5075"
 *   Slot:    IOSUBSYSTEM 100, IOADDRESS 20, SLOT 5, "module", "name"
 *   Slot bare: IOSUBSYSTEM 100, IOADDRESS 20, SLOT 0
 *   Subslot: IOSUBSYSTEM 100, IOADDRESS 20, SLOT 0, SUBSLOT 1, ...  (skipped)
 *
 * Participants are counted at IOADDRESS level only.  Subslots (ports/interfaces)
 * are intentionally excluded from the device list.
 *
 * @param {string[]} lines
 * @returns {{ systems: Array, devices: Array }}
 */
function _parseProfinet(lines) {
  const systems   = [];
  const systemMap = {}; // id -> system
  const devices   = [];
  const deviceMap = {}; // key: `${systemId}_${ioAddress}` -> device

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (!/^IOSUBSYSTEM\b/i.test(trimmed)) continue;

    // ── Subslot (skip): IOSUBSYSTEM …, IOADDRESS …, SLOT …, SUBSLOT …
    if (/^IOSUBSYSTEM\s+\d+\s*,\s*IOADDRESS\s+\d+\s*,\s*SLOT\s+\d+\s*,\s*SUBSLOT\b/i.test(trimmed)) {
      i = _skipBlock(lines, i + 1);
      continue;
    }

    // ── Slot with module/name (optional firmware token):
    //    IOSUBSYSTEM 100, IOADDRESS 20, SLOT 5, "module" ["fw"], "name"
    //    Groups: 1=systemId  2=ioAddress  3=slotNo  4=moduleType  [fw skipped]  5=moduleName
    const slotNameMatch = trimmed.match(
      /^IOSUBSYSTEM\s+(\d+)\s*,\s*IOADDRESS\s+(\d+)\s*,\s*SLOT\s+(\d+)\s*,\s*"([^"]*)"\s*(?:"[^"]*")?\s*,\s*"([^"]*)"\s*$/i
    );
    if (slotNameMatch) {
      const systemId   = parseInt(slotNameMatch[1], 10);
      const ioAddress  = parseInt(slotNameMatch[2], 10);
      const slotNo     = parseInt(slotNameMatch[3], 10);
      const moduleType = slotNameMatch[4];
      const moduleName = slotNameMatch[5];

      const slotObj = {
        slot:        slotNo,
        moduleType:  moduleType,
        moduleName:  moduleName,
        direction:   null,
        byteAddress: null,
        signals:     [],
      };
      i = _readSlotBlock(lines, i + 1, slotObj);

      const devKey = `${systemId}_${ioAddress}`;
      if (deviceMap[devKey]) {
        deviceMap[devKey].slots.push(slotObj);
        deviceMap[devKey].modulesCount++;
      }
      continue;
    }

    // ── Bare slot (no module/name): IOSUBSYSTEM 100, IOADDRESS 20, SLOT 0
    const slotBareMatch = trimmed.match(
      /^IOSUBSYSTEM\s+(\d+)\s*,\s*IOADDRESS\s+(\d+)\s*,\s*SLOT\s+(\d+)\s*$/i
    );
    if (slotBareMatch) {
      const systemId  = parseInt(slotBareMatch[1], 10);
      const ioAddress = parseInt(slotBareMatch[2], 10);
      const slotNo    = parseInt(slotBareMatch[3], 10);

      const slotObj = {
        slot:        slotNo,
        moduleType:  null,
        moduleName:  null,
        direction:   null,
        byteAddress: null,
        signals:     [],
      };
      i = _readSlotBlock(lines, i + 1, slotObj);

      const devKey = `${systemId}_${ioAddress}`;
      if (deviceMap[devKey]) {
        deviceMap[devKey].slots.push(slotObj);
        deviceMap[devKey].modulesCount++;
      }
      continue;
    }

    // ── Device header: IOSUBSYSTEM 100, IOADDRESS 20, "GSDML-…", "kf5075"
    const deviceMatch = trimmed.match(
      /^IOSUBSYSTEM\s+(\d+)\s*,\s*IOADDRESS\s+(\d+)\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*$/i
    );
    if (deviceMatch) {
      const systemId  = parseInt(deviceMatch[1], 10);
      const ioAddress = parseInt(deviceMatch[2], 10);
      const gsdml     = deviceMatch[3];
      const name      = deviceMatch[4];

      const devKey = `${systemId}_${ioAddress}`;
      if (!deviceMap[devKey]) {
        const dev = {
          systemId,
          ioAddress,
          gsdml,
          name,
          ip:           null,
          mac:          null,
          subnetMask:   null,
          router:       null,
          slots:        [],
          modulesCount: 0,
          signals:      [],
        };
        deviceMap[devKey] = dev;
        devices.push(dev);
      }
      i = _readPnParticipantBlock(lines, i + 1, deviceMap[devKey]);
      continue;
    }

    // ── System header: IOSUBSYSTEM 100, "PN: PROFINET-IO-System (100)"
    const systemMatch = trimmed.match(/^IOSUBSYSTEM\s+(\d+)\s*,\s*"([^"]*)"\s*$/i);
    if (systemMatch) {
      const id   = parseInt(systemMatch[1], 10);
      const name = systemMatch[2];
      if (!systemMap[id]) {
        const sys = { id, name };
        systemMap[id] = sys;
        systems.push(sys);
      }
      i = _skipBlock(lines, i + 1);
      continue;
    }
  }

  // Build per-device flat signal list
  for (const dev of devices) {
    for (const slot of dev.slots) {
      for (const sig of slot.signals) {
        dev.signals.push({
          deviceName:  dev.name    || `PN${dev.ioAddress}`,
          ioAddress:   dev.ioAddress,
          pnSystemId:  dev.systemId,
          module:      slot.moduleType || slot.moduleName || '',
          slot:        slot.slot,
          type:        sig.type,
          byteAddress: slot.byteAddress !== null ? slot.byteAddress : null,
          bit:         sig.bit,
          symbolName:  sig.name,
          comment:     sig.comment,
        });
      }
    }
  }

  return { systems, devices };
}

/**
 * Skips a BEGIN…END block, returning the index of the END line.
 * Uses a depth counter so nested BEGIN/END pairs are handled correctly.
 * If no BEGIN is found as the next non-blank line, returns startIdx - 1
 * so the caller's loop index stays on the current line.
 * @param {string[]} lines
 * @param {number} startIdx
 * @returns {number}
 */
function _skipBlock(lines, startIdx) {
  let i = startIdx;

  // Skip leading blank lines
  while (i < lines.length && !lines[i].trim()) i++;

  if (i >= lines.length || !/^BEGIN\b/i.test(lines[i].trim())) {
    return startIdx - 1; // no block present
  }

  let depth = 0;
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^BEGIN\b/i.test(t)) {
      depth++;
    } else if (/^END\b/i.test(t) && !/^END_/i.test(t)) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return i;
}

/**
 * Reads an IOSUBSYSTEM device BEGIN…END block (IOADDRESS format).
 * Extracts NAME, IPADDRESS, MACADDRESS, SUBNETMASK, ROUTERADDRESS.
 * Returns the line index of the END line.
 * @param {string[]} lines
 * @param {number} startIdx
 * @param {Object} dev
 * @returns {number}
 */
function _readPnParticipantBlock(lines, startIdx, dev) {
  let i = startIdx;
  let inBlock = false;

  for (; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (/^BEGIN\b/i.test(trimmed)) { inBlock = true; continue; }
    if (/^END\b/i.test(trimmed) && !/^END_/i.test(trimmed)) {
      return i;
    }

    if (!inBlock) continue;

    let m;
    if ((m = trimmed.match(/^NAME\s+"([^"]*)"/i)))              dev.name       = m[1];
    if ((m = trimmed.match(/^IPADDRESS\s+([0-9A-Fa-f ]+)/i)))  dev.ip         = _hexBytesToIp(m[1].trim());
    if ((m = trimmed.match(/^MACADDRESS\s+([0-9A-Fa-f ]+)/i))) dev.mac        = m[1].trim();
    if ((m = trimmed.match(/^SUBNETMASK\s+([0-9A-Fa-f ]+)/i))) dev.subnetMask = _hexBytesToIp(m[1].trim());
    if ((m = trimmed.match(/^ROUTERADDRESS\s+([0-9A-Fa-f ]+)/i))) dev.router  = _hexBytesToIp(m[1].trim());
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
