#!/usr/bin/env node

/**
 * Open-Source Persona Validator
 * 
 * Ensures all persona definitions adhere to strict schema rules,
 * valid folder placement, unique IDs, and complete field documentation.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const PERSONAS_DIR = path.join(ROOT_DIR, 'personas');

let hasErrors = false;
const seenIDs = new Map();
const seenCallings = new Map();
let totalPersonas = 0;

function logError(file, message) {
  hasErrors = true;
  const relPath = path.relative(ROOT_DIR, file);
  console.error(`❌ [ERROR] ${relPath}: ${message}`);
}

function logWarning(file, message) {
  const relPath = path.relative(ROOT_DIR, file);
  console.warn(`⚠️  [WARN]  ${relPath}: ${message}`);
}

function walkDir(dir) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walkDir(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }
  return files;
}

function validateFolderPlacement(file, id) {
  const relPath = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
  const prefix = id.substring(0, 4);

  let expectedDir = '';
  if (prefix === '1001') {
    expectedDir = 'personas/10-anime/01-vocaloid';
  } else if (prefix === '1002') {
    expectedDir = 'personas/10-anime/02-vtuber';
  } else if (prefix === '1003') {
    expectedDir = 'personas/10-anime/03-female';
  } else if (prefix === '1004') {
    expectedDir = 'personas/10-anime/04-male';
  } else if (prefix === '2003') {
    expectedDir = 'personas/20-game/03-female';
  } else if (prefix === '3001') {
    expectedDir = 'personas/30-assistant/01-assistant';
  }

  const actualDir = path.dirname(relPath);
  if (expectedDir && actualDir !== expectedDir) {
    logError(file, `File is placed in incorrect directory. Expected: "${expectedDir}/", Actual: "${actualDir}/"`);
  }
}

function validatePersona(filePath) {
  const fileName = path.basename(filePath);
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    logError(filePath, `Failed to read file: ${err.message}`);
    return;
  }

  let data;
  try {
    data = JSON.parse(content);
  } catch (err) {
    logError(filePath, `Malformed JSON syntax: ${err.message}`);
    return;
  }

  // 1. Validate ID
  if (!data.id || typeof data.id !== 'string') {
    logError(filePath, 'Field "id" is required and must be a string');
    return;
  }

  if (!/^[0-9]{6,}$/.test(data.id)) {
    logError(filePath, `Invalid "id" format "${data.id}". Must be at least 6 digits (TTCCNN...)`);
  }

  const nn = data.id.substring(4);
  if (!fileName.startsWith(`${nn}-`)) {
    logError(filePath, `File name "${fileName}" must start with character number "${nn}-"`);
  }

  if (seenIDs.has(data.id)) {
    logError(filePath, `Duplicate ID "${data.id}" already used in ${path.relative(ROOT_DIR, seenIDs.get(data.id))}`);
  } else {
    seenIDs.set(data.id, filePath);
  }

  // 2. Validate Folder Placement
  validateFolderPlacement(filePath, data.id);

  // 3. Validate Calling
  if (!data.calling || typeof data.calling !== 'string' || !data.calling.trim()) {
    logError(filePath, 'Field "calling" is required, non-empty string');
  } else {
    const callingLower = data.calling.toLowerCase().trim();
    if (seenCallings.has(callingLower)) {
      logWarning(filePath, `Calling trigger "${callingLower}" is also used by ${path.relative(ROOT_DIR, seenCallings.get(callingLower))}`);
    } else {
      seenCallings.set(callingLower, filePath);
    }
  }

  // 4. Validate String Fields (Must not be empty)
  const requiredStrings = ['name', 'description', 'scenario', 'first_message'];
  for (const field of requiredStrings) {
    if (!data[field] || typeof data[field] !== 'string' || !data[field].trim()) {
      logError(filePath, `Field "${field}" is required and cannot be empty`);
    }
  }

  // 5. Validate Array Fields (Must be non-empty arrays of strings)
  const requiredArrays = ['personality', 'appearance', 'features', 'behavior'];
  for (const field of requiredArrays) {
    if (!Array.isArray(data[field]) || data[field].length === 0) {
      logError(filePath, `Field "${field}" is required and must be a non-empty array`);
    } else {
      data[field].forEach((item, idx) => {
        if (!item || typeof item !== 'string' || !item.trim()) {
          logError(filePath, `Field "${field}[${idx}]" cannot be empty`);
        }
      });
    }
  }

  // 6. Validate World Info (Must be non-empty array of objects)
  if (!Array.isArray(data.world_info) || data.world_info.length === 0) {
    logError(filePath, 'Field "world_info" is required and must be a non-empty array');
  } else {
    data.world_info.forEach((wi, idx) => {
      if (!wi || typeof wi !== 'object') {
        logError(filePath, `world_info[${idx}] must be an object`);
        return;
      }
      if (!Array.isArray(wi.keywords) || wi.keywords.length === 0) {
        logError(filePath, `world_info[${idx}].keywords must be a non-empty array of strings`);
      }
      if (!wi.content || typeof wi.content !== 'string' || !wi.content.trim()) {
        logError(filePath, `world_info[${idx}].content cannot be empty`);
      }
    });
  }

  // 7. Validate Relationships (Must be non-empty array of objects)
  if (!Array.isArray(data.relationships) || data.relationships.length === 0) {
    logError(filePath, 'Field "relationships" is required and must be a non-empty array');
  } else {
    data.relationships.forEach((rel, idx) => {
      if (!rel || typeof rel !== 'object') {
        logError(filePath, `relationships[${idx}] must be an object`);
        return;
      }
      if (!rel.name || typeof rel.name !== 'string' || !rel.name.trim()) {
        logError(filePath, `relationships[${idx}].name cannot be empty`);
      }
      if (!rel.content || typeof rel.content !== 'string' || !rel.content.trim()) {
        logError(filePath, `relationships[${idx}].content cannot be empty`);
      }
    });
  }

  // 8. Validate Example Dialogues (Must be non-empty array of user/char objects)
  if (!Array.isArray(data.example_dialogues) || data.example_dialogues.length === 0) {
    logError(filePath, 'Field "example_dialogues" is required and must be a non-empty array');
  } else {
    data.example_dialogues.forEach((dlg, idx) => {
      if (!dlg || typeof dlg !== 'object') {
        logError(filePath, `example_dialogues[${idx}] must be an object`);
        return;
      }
      if (!dlg.user || typeof dlg.user !== 'string' || !dlg.user.trim()) {
        logError(filePath, `example_dialogues[${idx}].user cannot be empty`);
      }
      if (!dlg.char || typeof dlg.char !== 'string' || !dlg.char.trim()) {
        logError(filePath, `example_dialogues[${idx}].char cannot be empty`);
      }
    });
  }

  // 9. Validate Optional speech_patterns (Must be a non-empty string if present)
  if (data.speech_patterns !== undefined) {
    if (typeof data.speech_patterns !== 'string' || !data.speech_patterns.trim()) {
      logError(filePath, 'Field "speech_patterns", if present, must be a non-empty string');
    }
  }

  // 10. Validate Optional visual (Image generation metadata)
  if (data.visual !== undefined) {
    if (typeof data.visual !== 'object' || data.visual === null || Array.isArray(data.visual)) {
      logError(filePath, 'Field "visual", if present, must be an object');
    } else {
      if (data.visual.trigger_words !== undefined) {
        if (!Array.isArray(data.visual.trigger_words) || data.visual.trigger_words.length === 0) {
          logError(filePath, 'Field "visual.trigger_words" must be a non-empty array of strings');
        } else {
          data.visual.trigger_words.forEach((tw, idx) => {
            if (!tw || typeof tw !== 'string' || !tw.trim()) {
              logError(filePath, `visual.trigger_words[${idx}] cannot be empty`);
            }
          });
        }
      }
      if (data.visual.character_tags !== undefined) {
        if (!Array.isArray(data.visual.character_tags) || data.visual.character_tags.length === 0) {
          logError(filePath, 'Field "visual.character_tags" must be a non-empty array of strings');
        } else {
          data.visual.character_tags.forEach((tag, idx) => {
            if (!tag || typeof tag !== 'string' || !tag.trim()) {
              logError(filePath, `visual.character_tags[${idx}] cannot be empty`);
            }
          });
        }
      }
      if (data.visual.negative_prompt !== undefined) {
        if (typeof data.visual.negative_prompt !== 'string' || !data.visual.negative_prompt.trim()) {
          logError(filePath, 'Field "visual.negative_prompt" must be a non-empty string');
        }
      }
    }
  }

  totalPersonas++;
}

console.log('🔍 Scanning personas in:', PERSONAS_DIR);
if (!fs.existsSync(PERSONAS_DIR)) {
  console.error(`❌ Directory not found: ${PERSONAS_DIR}`);
  process.exit(1);
}

const files = walkDir(PERSONAS_DIR);
console.log(`📋 Found ${files.length} persona JSON files. Starting validation...\n`);

for (const file of files) {
  validatePersona(file);
}

console.log('\n========================================');
if (hasErrors) {
  console.error(`❌ Validation FAILED! Some personas have formatting errors.`);
  process.exit(1);
} else {
  console.log(`✅ Validation PASSED! All ${totalPersonas} personas are valid, complete, and properly categorized.`);
  process.exit(0);
}
