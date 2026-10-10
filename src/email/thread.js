// Threading: the Message-IDs an inbound email answers, from its In-Reply-To and
// References headers, to look up the Ticket it belongs to (Free tier matching).
// Pure functions, no imports and no n8n globals (ADR 0008). The input has the
// shape n8n's IMAP trigger gives with format "resolved" (mailparser):
// inReplyTo is a string; references is a string, or an array when there are several.

const MAX_THREAD_IDS = 30; // keeps the Notion query filter small

const ID_RE = /<[^<>\s]+>|[^<>\s,]+@[^<>\s,]+/g;

// Every Message-ID in a header value, in order, always in <angle brackets>.
function messageIds(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((v) => String(v ?? '').match(ID_RE) ?? []).map((id) => (id.startsWith('<') ? id : '<' + id + '>'));
}

// The Message-IDs to look a Ticket up by, most recent first: In-Reply-To, then
// References from newest to oldest. A long thread keeps its newest ids and its
// first one, the email that usually created the Ticket.
export function threadMessageIds(mail) {
  const references = messageIds(mail?.references);
  const own = messageIds(mail?.messageId)[0];
  const ids = [...new Set([...messageIds(mail?.inReplyTo), ...[...references].reverse()])].filter((id) => id !== own);
  if (ids.length <= MAX_THREAD_IDS) return ids;
  const first = references[0];
  return [...ids.filter((id) => id !== first).slice(0, MAX_THREAD_IDS - 1), first];
}
