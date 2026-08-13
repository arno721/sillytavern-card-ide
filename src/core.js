'use strict';

const CCV3_SPEC = 'chara_card_v3';
const CCV3_VERSION = '3.0';

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function emptyLorebook() {
  return {
    name: '',
    description: '',
    scan_depth: 4,
    token_budget: 2048,
    recursive_scanning: false,
    extensions: {},
    entries: []
  };
}

function emptyLoreEntry(index = 0) {
  return {
    keys: [],
    content: '',
    extensions: {},
    enabled: true,
    insertion_order: index,
    case_sensitive: false,
    use_regex: false,
    constant: false,
    name: `Entry ${index + 1}`,
    selective: false,
    secondary_keys: [],
    position: 'before_char'
  };
}

function createEmptyCard(name = 'New Character') {
  const ts = nowUnix();
  return {
    spec: CCV3_SPEC,
    spec_version: CCV3_VERSION,
    data: {
      name,
      description: '',
      tags: [],
      creator: '',
      character_version: '1.0',
      mes_example: '',
      extensions: {},
      system_prompt: '',
      post_history_instructions: '',
      first_mes: '',
      alternate_greetings: [],
      personality: '',
      scenario: '',
      creator_notes: '',
      group_only_greetings: [],
      nickname: '',
      creator_notes_multilingual: {},
      source: [],
      assets: [
        { type: 'icon', uri: 'ccdefault:', name: 'main', ext: 'png' }
      ],
      character_book: emptyLorebook(),
      creation_date: ts,
      modification_date: ts
    }
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}
function asArray(value) {
  return Array.isArray(value) ? value : [];
}
function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function asBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}
function asNumber(value, fallback = undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeLoreEntry(input, index) {
  const e = asObject(input);
  const out = {
    ...e,
    keys: asArray(e.keys).map(String),
    content: asString(e.content),
    extensions: asObject(e.extensions),
    enabled: asBoolean(e.enabled, true),
    insertion_order: asNumber(e.insertion_order, index),
    use_regex: asBoolean(e.use_regex, false),
    constant: asBoolean(e.constant, false)
  };
  if (e.case_sensitive !== undefined) out.case_sensitive = asBoolean(e.case_sensitive);
  if (e.name !== undefined) out.name = asString(e.name);
  if (e.priority !== undefined) out.priority = asNumber(e.priority, 0);
  if (e.id !== undefined && (typeof e.id === 'string' || typeof e.id === 'number')) out.id = e.id;
  if (e.comment !== undefined) out.comment = asString(e.comment);
  if (e.selective !== undefined) out.selective = asBoolean(e.selective);
  if (e.secondary_keys !== undefined) out.secondary_keys = asArray(e.secondary_keys).map(String);
  if (e.position === 'before_char' || e.position === 'after_char') out.position = e.position;
  return out;
}

function normalizeLorebook(input) {
  if (input === undefined || input === null) return undefined;
  const b = asObject(input);
  const out = {
    ...b,
    extensions: asObject(b.extensions),
    entries: asArray(b.entries).map(normalizeLoreEntry)
  };
  if (b.name !== undefined) out.name = asString(b.name);
  if (b.description !== undefined) out.description = asString(b.description);
  if (b.scan_depth !== undefined) out.scan_depth = asNumber(b.scan_depth, 0);
  if (b.token_budget !== undefined) out.token_budget = asNumber(b.token_budget, 0);
  if (b.recursive_scanning !== undefined) out.recursive_scanning = asBoolean(b.recursive_scanning);
  return out;
}

function normalizeCard(input) {
  const root = asObject(input);
  const isV3 = root.spec === CCV3_SPEC && asObject(root.data);
  const isV2 = root.spec === 'chara_card_v2' && asObject(root.data);
  const source = isV3 || isV2 ? asObject(root.data) : root;
  const base = createEmptyCard(asString(source.name, 'Imported Character'));
  const d = base.data;

  const stringFields = [
    'name', 'description', 'creator', 'character_version', 'mes_example',
    'system_prompt', 'post_history_instructions', 'first_mes', 'personality',
    'scenario', 'creator_notes', 'nickname'
  ];
  for (const key of stringFields) {
    if (source[key] !== undefined) d[key] = asString(source[key]);
  }

  d.tags = asArray(source.tags).map(String);
  d.alternate_greetings = asArray(source.alternate_greetings).map(String);
  d.group_only_greetings = asArray(source.group_only_greetings).map(String);
  d.extensions = asObject(source.extensions);
  d.creator_notes_multilingual = asObject(source.creator_notes_multilingual);
  d.source = asArray(source.source).map(String);
  d.assets = asArray(source.assets).map((asset) => {
    const a = asObject(asset);
    return {
      ...a,
      type: asString(a.type, 'other'),
      uri: asString(a.uri),
      name: asString(a.name),
      ext: asString(a.ext, 'unknown').toLowerCase().replace(/^\./, '')
    };
  });
  if (!d.assets.length) {
    d.assets = [{ type: 'icon', uri: 'ccdefault:', name: 'main', ext: 'png' }];
  }

  const book = normalizeLorebook(source.character_book);
  d.character_book = book === undefined ? emptyLorebook() : book;
  d.creation_date = asNumber(source.creation_date, d.creation_date);
  d.modification_date = asNumber(source.modification_date, d.modification_date);

  for (const [key, value] of Object.entries(source)) {
    if (!(key in d)) d[key] = clone(value);
  }
  for (const [key, value] of Object.entries(root)) {
    if (!['spec', 'spec_version', 'data'].includes(key)) base[key] = clone(value);
  }

  base.spec = CCV3_SPEC;
  base.spec_version = CCV3_VERSION;
  return base;
}

function validateCard(input) {
  const issues = [];
  const push = (severity, path, message) => issues.push({ severity, path, message });
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    push('error', '$', 'Card must be a JSON object.');
    return issues;
  }
  if (input.spec !== CCV3_SPEC) push('error', 'spec', `Must equal "${CCV3_SPEC}".`);
  if (typeof input.spec_version !== 'string') push('error', 'spec_version', 'Must be a string.');
  else if (input.spec_version !== CCV3_VERSION) push('warning', 'spec_version', `Editor targets CCv3 ${CCV3_VERSION}; imported value is ${input.spec_version}.`);
  if (!input.data || typeof input.data !== 'object' || Array.isArray(input.data)) {
    push('error', 'data', 'Must be an object.');
    return issues;
  }
  const d = input.data;
  const requiredStrings = [
    'name','description','creator','character_version','mes_example','system_prompt',
    'post_history_instructions','first_mes','personality','scenario','creator_notes'
  ];
  for (const key of requiredStrings) {
    if (typeof d[key] !== 'string') push('error', `data.${key}`, 'Must be a string.');
  }
  if (!Array.isArray(d.tags) || d.tags.some(x => typeof x !== 'string')) push('error', 'data.tags', 'Must be an array of strings.');
  if (!Array.isArray(d.alternate_greetings) || d.alternate_greetings.some(x => typeof x !== 'string')) push('error', 'data.alternate_greetings', 'Must be an array of strings.');
  if (!Array.isArray(d.group_only_greetings) || d.group_only_greetings.some(x => typeof x !== 'string')) push('error', 'data.group_only_greetings', 'CCv3 requires an array of strings.');
  if (!d.extensions || typeof d.extensions !== 'object' || Array.isArray(d.extensions)) push('error', 'data.extensions', 'Must be an object.');
  if (d.creation_date !== undefined && (!Number.isFinite(d.creation_date) || d.creation_date < 0)) push('error', 'data.creation_date', 'Must be a non-negative Unix timestamp in seconds.');
  if (d.modification_date !== undefined && (!Number.isFinite(d.modification_date) || d.modification_date < 0)) push('error', 'data.modification_date', 'Must be a non-negative Unix timestamp in seconds.');

  if (d.assets !== undefined) {
    if (!Array.isArray(d.assets)) push('error', 'data.assets', 'Must be an array.');
    else {
      d.assets.forEach((a, i) => {
        const p = `data.assets[${i}]`;
        if (!a || typeof a !== 'object' || Array.isArray(a)) return push('error', p, 'Must be an object.');
        for (const k of ['type','uri','name','ext']) if (typeof a[k] !== 'string') push('error', `${p}.${k}`, 'Must be a string.');
        if (typeof a.ext === 'string' && (a.ext.startsWith('.') || a.ext !== a.ext.toLowerCase())) push('warning', `${p}.ext`, 'Should be a lowercase extension without a leading dot.');
      });
      const icons = d.assets.filter(a => a && a.type === 'icon');
      if (icons.length > 1 && icons.filter(a => a.name === 'main').length !== 1) push('error', 'data.assets', 'When multiple icon assets exist, exactly one must be named "main".');
      const backgrounds = d.assets.filter(a => a && a.type === 'background' && a.name === 'main');
      if (backgrounds.length > 1) push('error', 'data.assets', 'At most one background asset may be named "main".');
    }
  }

  if (d.character_book !== undefined) validateLorebook(d.character_book, 'data.character_book', push);
  return issues;
}

function validateLorebook(book, path, push) {
  if (!book || typeof book !== 'object' || Array.isArray(book)) return push('error', path, 'Must be an object.');
  if (!book.extensions || typeof book.extensions !== 'object' || Array.isArray(book.extensions)) push('error', `${path}.extensions`, 'Must be an object.');
  if (!Array.isArray(book.entries)) return push('error', `${path}.entries`, 'Must be an array.');
  book.entries.forEach((e, i) => {
    const p = `${path}.entries[${i}]`;
    if (!e || typeof e !== 'object' || Array.isArray(e)) return push('error', p, 'Must be an object.');
    if (!Array.isArray(e.keys) || e.keys.some(x => typeof x !== 'string')) push('error', `${p}.keys`, 'Must be an array of strings.');
    if (typeof e.content !== 'string') push('error', `${p}.content`, 'Must be a string.');
    if (!e.extensions || typeof e.extensions !== 'object' || Array.isArray(e.extensions)) push('error', `${p}.extensions`, 'Must be an object.');
    if (typeof e.enabled !== 'boolean') push('error', `${p}.enabled`, 'Must be a boolean.');
    if (typeof e.insertion_order !== 'number' || !Number.isFinite(e.insertion_order)) push('error', `${p}.insertion_order`, 'Must be a number.');
    if (typeof e.use_regex !== 'boolean') push('error', `${p}.use_regex`, 'CCv3 requires a boolean.');
    if (e.constant !== undefined && typeof e.constant !== 'boolean') push('error', `${p}.constant`, 'Must be a boolean when present.');
    if (e.use_regex && Array.isArray(e.keys)) {
      e.keys.forEach((pattern, k) => {
        try { parseRegexPattern(pattern); } catch (err) { push('warning', `${p}.keys[${k}]`, `Invalid regex: ${err.message}`); }
      });
    }
  });
}

function parseRegexPattern(pattern) {
  if (typeof pattern !== 'string') throw new Error('Pattern is not a string');
  if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
    const last = pattern.lastIndexOf('/');
    return new RegExp(pattern.slice(1, last), pattern.slice(last + 1));
  }
  return new RegExp(pattern);
}

function safeFileName(name) {
  const cleaned = String(name || 'character')
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim();
  return cleaned || 'character';
}

module.exports = {
  CCV3_SPEC,
  CCV3_VERSION,
  nowUnix,
  createEmptyCard,
  emptyLorebook,
  emptyLoreEntry,
  normalizeCard,
  validateCard,
  safeFileName
};
