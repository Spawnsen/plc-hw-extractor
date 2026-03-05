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
 * Extracts file metadata from comment header lines.
 * STEP 7 .cfg files often start with comment lines like:
 *   ; Version: 3.2
 *   ; STEP7_Version: V5.7 + SP4
 *   ; Created: 01.01.2024
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
    // Stop once we hit a non-comment non-blank line
    if (trimmed && !trimmed.startsWith(';')) break;

    let m;
    if ((m = trimmed.match(/;\s*(?:File)?[Vv]ersion\s*[=:]\s*(.+)/))) {
      meta.fileVersion = m[1].trim();
    } else if ((m = trimmed.match(/;\s*STEP\s*7[_-]?[Vv]ersion\s*[=:]\s*(.+)/i))) {
      meta.step7Version = m[1].trim();
    } else if ((m = trimmed.match(/;\s*[Cc]reated\s*[=:]\s*(.+)/))) {
      meta.created = m[1].trim();
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
 * @param {string[]} lines
 * @returns {Object|null}
 */
function _parseRack(lines) {
  let rack = null;
  let inRack = false;
  let depth = 0;
  let currentSlot = null;
  let inModule = false;
  let moduleDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inRack) {
      // RACK <no> [, "<name>"]
      const m = trimmed.match(/^RACK\s+(\d+)(?:\s*,\s*"([^"]*)")?/i);
      if (m) {
        rack = {
          rackNo: parseInt(m[1], 10),
          articleNumber: null,
          name: m[2] || null,
          slots: [],
        };
        inRack = true;
        depth = 0;
        continue;
      }
    }

    if (!inRack || !rack) continue;

    if (/^BEGIN\b/i.test(trimmed) && !inModule) {
      depth++;
      continue;
    }

    if (/^END\b/i.test(trimmed) && !trimmed.match(/^END_/i) && !inModule) {
      depth--;
      if (depth <= 0) {
        inRack = false;
        continue;
      }
      continue;
    }

    // Inside rack block
    let m;

    // Rack-level keys
    if (!inModule) {
      if ((m = trimmed.match(/^ARTICLE_NUMBER\s+"([^"]*)"/i))) rack.articleNumber = m[1];
      if ((m = trimmed.match(/^NAME\s+"([^"]*)"/i))) rack.name = rack.name || m[1];
    }

    // Module block inside rack: MODULE <slot> [, "<name>"]
    if (!inModule) {
      if ((m = trimmed.match(/^MODULE\s+(\d+)(?:\s*,\s*"([^"]*)")?/i))) {
        currentSlot = {
          slot: parseInt(m[1], 10),
          articleNumber: null,
          name: m[2] || null,
          type: null,
        };
        inModule = true;
        moduleDepth = 0;
        continue;
      }
    }

    if (inModule) {
      if (/^BEGIN\b/i.test(trimmed)) { moduleDepth++; continue; }
      if (/^END\b/i.test(trimmed) && !trimmed.match(/^END_/i)) {
        moduleDepth--;
        if (moduleDepth <= 0) {
          if (currentSlot) {
            currentSlot.type = _detectSlotType(currentSlot.articleNumber);
            rack.slots.push(currentSlot);
            currentSlot = null;
          }
          inModule = false;
        }
        continue;
      }

      if ((m = trimmed.match(/^ARTICLE_NUMBER\s+"([^"]*)"/i))) currentSlot.articleNumber = m[1];
      if ((m = trimmed.match(/^NAME\s+"([^"]*)"/i)))           currentSlot.name          = currentSlot.name || m[1];
    }
  }

  return rack;
}

/**
 * Detects the slot type from article number prefix.
 * @param {string|null} articleNumber
 * @returns {string}
 */
function _detectSlotType(articleNumber) {
  if (!articleNumber) return 'unknown';
  const a = articleNumber.trim();
  if (/^6ES7\s+407/i.test(a))          return 'PS';
  if (/^6ES7\s+4[01]\d/i.test(a))      return 'CPU';
  if (/^6GK/i.test(a))                 return 'CP';
  if (/^6ES7\s+3/i.test(a))            return 'SM';
  if (/^6ES7/i.test(a))                return 'SM';
  return 'unknown';
}

// ─── DP Slaves ────────────────────────────────────────────────────────────────

/**
 * Extracts all DPSUBSYSTEM / DP slave blocks.
 * @param {string[]} lines
 * @returns {Array}
 */
function _parseDpSlaves(lines) {
  const slaves = [];

  // We'll do a two-pass: first find all slave blocks boundaries,
  // then parse each one.
  const slaveBlocks = _findSlaveBlocks(lines);

  for (const block of slaveBlocks) {
    const slave = _parseOneSlave(lines, block.start, block.end);
    if (slave) slaves.push(slave);
  }

  return slaves;
}

/**
 * Finds the line index ranges of each DPSUBSYSTEM slave block.
 * @param {string[]} lines
 * @returns {Array<{start:number, end:number}>}
 */
function _findSlaveBlocks(lines) {
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Look for DPSUBSYSTEM header
    if (/^DPSUBSYSTEM\s+/i.test(trimmed)) {
      const start = i;
      let depth = 0;
      let end = i;

      // Walk forward to find the matching END
      for (let j = i; j < lines.length; j++) {
        const t = lines[j].trim();
        if (/^BEGIN\b/i.test(t)) depth++;
        if (/^END\b/i.test(t) && !t.match(/^END_/i)) {
          depth--;
          if (depth <= 0) {
            end = j;
            break;
          }
        }
      }

      blocks.push({ start, end });
      i = end + 1;
      continue;
    }
    i++;
  }

  return blocks;
}

/**
 * Parses one DPSUBSYSTEM slave block.
 * @param {string[]} lines
 * @param {number} startIdx
 * @param {number} endIdx
 * @returns {Object|null}
 */
function _parseOneSlave(lines, startIdx, endIdx) {
  const headerLine = lines[startIdx].trim();
  // DPSUBSYSTEM <addr> [, "<name>"]  or with AUTOCREATED / MASTER flags on next lines
  const headerMatch = headerLine.match(/^DPSUBSYSTEM\s+(\d+)(?:\s*,\s*"([^"]*)")?/i);
  if (!headerMatch) return null;

  const slave = {
    dpAddress: parseInt(headerMatch[1], 10),
    name:      headerMatch[2] || null,
    gsdFile:   null,
    assetId:   null,
    slots:     [],
  };

  let currentSlotObj = null;
  let inSlot = false;
  let slotDepth = 0;
  let pendingAddressType = null; // 'IN' | 'OUT'
  let inLocalAddresses = false;

  for (let i = startIdx + 1; i <= endIdx; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip pure structural keywords at the top level
    if (/^BEGIN\b/i.test(trimmed) && !inSlot) continue;
    if (/^END\b/i.test(trimmed) && !trimmed.match(/^END_/i) && !inSlot) continue;

    if (!inSlot) {
      // Slave-level keys
      let m;
      if ((m = trimmed.match(/^NAME\s+"([^"]*)"/i)))        slave.name    = slave.name || m[1];
      if ((m = trimmed.match(/^ASSET_ID\s+"([^"]*)"/i)))    slave.assetId = m[1];
      if ((m = trimmed.match(/^GSD_FILE\s+"([^"]*)"/i)))    slave.gsdFile = m[1];

      // SLOTCONFIG or DP_SLOT block: DPSUBSYSTEM_SLOT <no> [, "<name>"]
      if ((m = trimmed.match(/^(?:DPSUBSYSTEM_)?SLOT\s+(\d+)(?:\s*,\s*"([^"]*)")?/i))) {
        currentSlotObj = {
          slot:        parseInt(m[1], 10),
          moduleType:  null,
          moduleName:  m[2] || null,
          direction:   null,
          byteAddress: null,
          signals:     [],
        };
        inSlot = true;
        slotDepth = 0;
        continue;
      }
    }

    if (inSlot && currentSlotObj) {
      if (/^BEGIN\b/i.test(trimmed)) { slotDepth++; continue; }
      if (/^END\b/i.test(trimmed) && !trimmed.match(/^END_/i)) {
        slotDepth--;
        if (slotDepth <= 0) {
          slave.slots.push(currentSlotObj);
          currentSlotObj = null;
          inSlot = false;
          inLocalAddresses = false;
          pendingAddressType = null;
        }
        continue;
      }

      let m;
      if ((m = trimmed.match(/^MODULE_TYPE\s+"([^"]*)"/i))) currentSlotObj.moduleType = m[1];
      if ((m = trimmed.match(/^NAME\s+"([^"]*)"/i)))        currentSlotObj.moduleName = currentSlotObj.moduleName || m[1];

      // Signal lines: SYMBOL I , <byte> , "<name>" , "<comment>"
      // or:           SYMBOL O , <byte> , "<name>" , "<comment>"
      if ((m = trimmed.match(/^SYMBOL\s+(I|O)\s*,\s*(\d+)\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"/i))) {
        const sigType    = m[1].toUpperCase();
        const byteAddr   = parseInt(m[2], 10);
        const sigName    = m[3];
        const sigComment = m[4];

        // Signals inside SYMBOL blocks sometimes have an explicit bit field next
        // but the basic format only gives byte. We'll treat bit as index within slot.
        const bitIndex = currentSlotObj.signals.filter(s => s.type === sigType).length;

        if (!currentSlotObj.direction) {
          currentSlotObj.direction = sigType === 'I' ? 'IN' : 'OUT';
          currentSlotObj.byteAddress = byteAddr;
        }

        currentSlotObj.signals.push({
          bit:     bitIndex,
          type:    sigType,
          name:    sigName,
          comment: sigComment,
        });
        continue;
      }

      // LOCAL_IN_ADDRESSES / LOCAL_OUT_ADDRESSES block
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

      if (inLocalAddresses) {
        // ADDRESS <byteAddr> <something>
        if ((m = trimmed.match(/^ADDRESS\s+(\d+)/i))) {
          if (currentSlotObj.byteAddress === null) {
            currentSlotObj.byteAddress = parseInt(m[1], 10);
            currentSlotObj.direction   = pendingAddressType;
          }
          inLocalAddresses = false;
          continue;
        }
        // If another keyword appears, we left the addresses block
        if (trimmed && !/^\d/.test(trimmed)) {
          inLocalAddresses = false;
        }
      }
    }
  }

  return slave;
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
