// Email cleanup: turns an inbound email into a Ticket title and body.
// Pure functions, no imports and no n8n globals (ADR 0008). The input has the
// shape n8n's IMAP trigger gives with format "resolved" (mailparser):
// { subject, from: { value: [{ name, address }] }, html (string or false), text, messageId }.

const MAX_TITLE = 2000; // Notion rejects rich text over 2000 characters.

// ---- Subject ----

const PREFIX_RE = /^\s*\[?\s*(?:re|fwd?|tr|rv)\s*(?:[[(]\s*\d+\s*[\])])?\s*:\s*/i;
const FORWARD_SUBJECT_RE = /^\s*\[?\s*(?:fwd?|tr|rv)\s*:/i;

export function cleanSubject(subject) {
  let s = String(subject ?? '');
  let bracketed = false;
  for (let prev = null; s !== prev;) {
    prev = s;
    if (/^\s*\[/.test(s) && PREFIX_RE.test(s)) bracketed = true;
    s = s.replace(PREFIX_RE, '');
  }
  return (bracketed ? removeFirstUnmatchedBracket(s) : s).trim();
}

// "[Fwd: Hello] see [doc]" → after the prefix, "Hello] see [doc]": drop the "]" that closed "[Fwd:".
function removeFirstUnmatchedBracket(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '[') depth++;
    else if (s[i] === ']' && depth-- === 0) return s.slice(0, i) + s.slice(i + 1);
  }
  return s;
}

// ---- Encoding repair ----

// Windows-1252 characters for bytes 0x80–0x9F, as a mis-decoder shows them.
const CP1252 = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88,
  '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93,
  '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};
const CONT = '[\\u0080-\\u00BF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]';
// A UTF-8 lead byte (0xC2–0xF4) read as Latin-1/Windows-1252, followed by continuation bytes.
const MOJIBAKE_RE = new RegExp(`[\\u00C2-\\u00F4]${CONT}+`, 'g');

function byteOf(ch) {
  const code = ch.charCodeAt(0);
  return code <= 0xff ? code : CP1252[ch];
}

// Strict UTF-8 decoding of a byte run; returns null if the bytes aren't valid UTF-8.
function decodeUtf8(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    const len = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc2 ? 2 : 0;
    if (!len || i + len > bytes.length) return null;
    let cp = b & (0xff >> (len + 1));
    for (let k = 1; k < len; k++) {
      const c = bytes[i + k];
      if ((c & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (c & 0x3f);
    }
    if (cp > 0x10ffff || (len === 3 && cp < 0x800) || (len === 4 && cp < 0x10000)) return null;
    out += String.fromCodePoint(cp);
    i += len;
  }
  return out;
}

// Repairs UTF-8 text that was decoded as Latin-1 or Windows-1252 ("Ã©tÃ©" → "été").
// Each broken run is repaired on its own, so correct text around it is untouched.
export function fixDoubleEncoding(str) {
  return String(str ?? '').replace(MOJIBAKE_RE, (run) => {
    // A run can end with a correct character (e.g. "Ã©tÃ©" then "…"): try the longest valid prefix.
    for (let end = run.length; end >= 2; end--) {
      const bytes = [...run.slice(0, end)].map(byteOf);
      if (bytes.some((b) => b === undefined)) continue;
      const decoded = decodeUtf8(bytes);
      if (decoded !== null) return decoded + run.slice(end);
    }
    return run;
  });
}

// ---- HTML to text ----

const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„',
  ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·', euro: '€', copy: '©', reg: '®',
  trade: '™', deg: '°', sect: '§', para: '¶', times: '×', divide: '÷', iexcl: '¡', iquest: '¿',
  cent: '¢', pound: '£', yen: '¥', shy: '', ordf: 'ª', ordm: 'º', micro: 'µ', plusmn: '±',
  frac12: '½', frac14: '¼', frac34: '¾', sup2: '²', sup3: '³', thinsp: ' ', ensp: ' ', emsp: ' ',
  zwnj: '', zwj: '', lrm: '', rlm: '', szlig: 'ß', oelig: 'œ', OElig: 'Œ', aelig: 'æ', AElig: 'Æ',
};
// Accented letters: &eacute; &Agrave; &ccedil; &ntilde; &ouml; &oslash; &aring; …
const ACCENTS = { acute: '́', grave: '̀', circ: '̂', uml: '̈', tilde: '̃', cedil: '̧', ring: '̊' };

function namedEntity(name) {
  if (name in ENTITIES) return ENTITIES[name];
  const m = name.match(/^([a-zA-Z])(acute|grave|circ|uml|tilde|cedil|ring)$/);
  if (m) return (m[1] + ACCENTS[m[2]]).normalize('NFC');
  if (name === 'oslash') return 'ø';
  if (name === 'Oslash') return 'Ø';
  return null;
}

export function decodeEntities(str) {
  return String(str ?? '').replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    const ch = namedEntity(name);
    return ch === null ? whole : ch;
  });
}

const BLOCK = 'p|div|tr|h[1-6]|blockquote|ul|ol|li|table|pre|address|section|article|header|footer|dl|dt|dd|center';
const EDGE = '\u0001'; // a block edge: becomes a line break, but several in a row count once

export function htmlToText(html) {
  const marked = String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(head|style|script|title|xml)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/\s+/g, ' ') // source newlines are just whitespace in HTML
    .replace(/<br\b[^>]*>/gi, '\n')
    .replace(/<hr\b[^>]*>/gi, `${EDGE}________________________________${EDGE}`)
    .replace(/<li\b[^>]*>/gi, `${EDGE}- `)
    .replace(new RegExp(`</?(?:${BLOCK})\\b[^>]*>`, 'gi'), EDGE)
    .replace(/<\/t[dh]\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '');
  const text = marked
    .replace(new RegExp(`${EDGE}(?:[ ]*${EDGE})*`, 'g'), EDGE)
    .replace(new RegExp(`(^|\\n)[ ]*${EDGE}`, 'g'), '$1') // an edge right after a <br> adds nothing
    .replaceAll(EDGE, '\n');
  return decodeEntities(text);
}

// ---- Text cleanup ----

export function normaliseWhitespace(str) {
  return String(str ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[     \t]/g, ' ')
    .replace(/[​-‍﻿]/g, '')
    .split('\n')
    .map((line) => line.replace(/ {2,}/g, ' ').trim())
    .filter((line, i, lines) => line !== '' || (i > 0 && lines[i - 1] !== ''))
    .join('\n')
    .trim();
}

const FORWARD_BODY_RE = /^\s*(?:-{2,}\s*(?:forwarded message|message transféré|message réexpédié)|begin forwarded message\s*:|début du message (?:réexpédié|transféré)\s*:)/im;

export function isForward(subject, text) {
  return FORWARD_SUBJECT_RE.test(String(subject ?? '')) || FORWARD_BODY_RE.test(String(text ?? ''));
}

const ORIGINAL_MESSAGE_RE = /^-{2,}\s*(?:original message|message d'origine|message original)\s*-{2,}$/i;
const ATTRIBUTION_START_RE = /^(?:on|le)\s/i;
const ATTRIBUTION_END_RE = /(?:\bwrote|\ba écrit)\s*:\s*$/i;
const HEADER_FROM_RE = /^(?:from|de)\s*:/i;
const HEADER_SENT_RE = /^(?:sent|envoyé|date)\s*:/i;
const HEADER_SUBJECT_RE = /^(?:subject|objet)\s*:/i;
const SEPARATOR_RE = /^(?:_{5,}|-{5,})$/;

// The text before line i; the whole text if i is -1 or nothing would be left.
function cutAt(text, lines, i) {
  if (i < 0) return text;
  const kept = lines.slice(0, i).join('\n').trim();
  return kept === '' ? text : kept;
}

// Index of the first line of quoted history, or -1.
function quotedHistoryStart(lines) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('>') || ORIGINAL_MESSAGE_RE.test(line)) return i;
    if (ATTRIBUTION_START_RE.test(line)) {
      // Clients wrap long attributions ("On …, Name <addr>\nwrote:").
      for (let k = i; k < Math.min(i + 3, lines.length); k++) {
        if (ATTRIBUTION_END_RE.test(lines[k].trim())) return i;
      }
    }
    if (HEADER_FROM_RE.test(line)) {
      const next = lines.slice(i + 1, i + 6).map((l) => l.trim());
      if (next.some((l) => HEADER_SENT_RE.test(l)) && next.some((l) => HEADER_SUBJECT_RE.test(l))) {
        let start = i;
        while (start > 0 && (lines[start - 1].trim() === '' || SEPARATOR_RE.test(lines[start - 1].trim()))) start--;
        return start;
      }
    }
  }
  return -1;
}

export function stripQuotedHistory(text) {
  const lines = String(text ?? '').split('\n');
  return cutAt(text, lines, quotedHistoryStart(lines));
}

const NOTICE_RES = [
  /^(?:confidentiality notice|avis de confidentialit[ée]|confidentialit[ée]|confidential(?:ity)?|disclaimer)\s*[:\-–]/i,
  /\bthis (?:e-?mail|message|communication|transmission)\b.{0,120}\b(?:confidential|privileged)\b/i,
  /\b(?:ce|le présent) (?:courriel|message|courrier électronique|document)\b.{0,160}\bconfidenti/i,
];

// Removes an EN/FR confidentiality notice and everything after it,
// unless it is the first thing in the message.
export function stripConfidentialityNotice(text) {
  const lines = String(text ?? '').split('\n');
  return cutAt(text, lines, lines.findIndex((line) => NOTICE_RES.some((re) => re.test(line.trim()))));
}

// ---- Sender ----

export function parseSender(from) {
  const first = from?.value?.[0] ?? {};
  const email = String(first.address ?? '').trim().toLowerCase();
  let name = normaliseWhitespace(fixDoubleEncoding(String(first.name ?? ''))).replace(/^["']+|["']+$/g, '').trim();
  const comma = name.match(/^([^,]+),\s*([^,]+)$/);
  if (comma) name = `${comma[2]} ${comma[1]}`;
  if (!name || name.toLowerCase() === email) return { name: email, firstName: '', lastName: '', email };
  const [firstName, ...rest] = name.split(/\s+/);
  return { name, firstName, lastName: rest.join(' '), email };
}

// ---- Whole email ----

export function cleanEmail(mail) {
  const subject = fixDoubleEncoding(decodeEntities(String(mail?.subject ?? '')));
  const raw = mail?.html ? htmlToText(mail.html) : String(mail?.text ?? '');
  const text = normaliseWhitespace(fixDoubleEncoding(raw));
  const forward = isForward(subject, text);

  let body = forward ? text : stripQuotedHistory(text);
  body = normaliseWhitespace(stripConfidentialityNotice(body));

  return {
    title: (cleanSubject(subject) || '(no subject)').slice(0, MAX_TITLE),
    body,
    isForward: forward,
    sender: parseSender(mail?.from),
    messageId: mail?.messageId ?? '',
  };
}
