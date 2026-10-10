// Notion API requests for the Inbound workflow: add a same-thread follow-up to its
// Ticket as a comment, or find or create the Contact for the email's From address,
// then create the Ticket. Pure functions, no imports (ADR 0008).
// Property names match the Notion template (docs/notion-template.md).

const API = 'https://api.notion.com/v1';
const MAX_TEXT = 2000; // characters per rich text piece
const MAX_BLOCKS = 100; // children per request

const richText = (s) => {
  const pieces = [];
  for (let i = 0; i < s.length; i += MAX_TEXT) pieces.push({ type: 'text', text: { content: s.slice(i, i + MAX_TEXT) } });
  return pieces;
};

const paragraph = (s) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: richText(s) } });

// One paragraph block per paragraph; past the block limit, the rest goes into the last block.
export function textToBlocks(text, maxBlocks = MAX_BLOCKS) {
  const paragraphs = String(text ?? '').split(/\n{2,}/).filter((p) => p.trim() !== '');
  if (paragraphs.length > maxBlocks) {
    paragraphs.splice(maxBlocks - 1, Infinity, paragraphs.slice(maxBlocks - 1).join('\n\n'));
  }
  return paragraphs.map(paragraph);
}

export function findContactRequest(email, contactsDatabaseId) {
  return {
    method: 'POST',
    url: API + '/databases/' + contactsDatabaseId + '/query',
    body: { filter: { property: 'Email', email: { equals: email } }, page_size: 1 },
  };
}

export function createContactRequest(sender, contactsDatabaseId) {
  return {
    method: 'POST',
    url: API + '/pages',
    body: {
      parent: { database_id: contactsDatabaseId },
      properties: {
        Name: { title: richText(sender.name || sender.email) },
        'First name': { rich_text: richText(sender.firstName || '') },
        'Last name': { rich_text: richText(sender.lastName || '') },
        Email: { email: sender.email },
      },
    },
  };
}

// De-duplication: a Ticket already created from this email. Message-IDs will
// hold several ids once replies are threaded, hence "contains". An email without
// a Message-ID can't be matched; the workflow treats it as new whatever this finds.
export function findTicketRequest(messageId, ticketsDatabaseId) {
  return {
    method: 'POST',
    url: API + '/databases/' + ticketsDatabaseId + '/query',
    body: {
      filter: { property: 'Message-IDs', rich_text: messageId ? { contains: messageId } : { is_empty: true } },
      page_size: 1,
    },
  };
}

const notStored = ({ name, reason }) => ({
  object: 'block',
  type: 'callout',
  callout: { icon: { type: 'emoji', emoji: '⚠️' }, rich_text: richText('Attachment not stored: ' + name + ' (' + reason + ')') },
});

// The email text, then a callout per attachment that could not be stored.
function emailBlocks(cleaned, uploads) {
  const notes = uploads.failed.map(notStored).slice(0, MAX_BLOCKS - 1);
  return [...textToBlocks(cleaned.body, MAX_BLOCKS - notes.length), ...notes];
}

// Status is left out so the Ticket gets the database's default option (New),
// which keeps working if the Desk owner renames the options (ADR 0006).
// cleaned: the result of cleanEmail (src/email/cleanup.js).
// uploads: the result of collectUploads (src/inbound/attachments.js).
function ticketPage(cleaned, contactId, ticketsDatabaseId, uploads) {
  const properties = {
    Title: { title: richText(cleaned.title) },
    Requester: { relation: [{ id: contactId }] },
    'Message-IDs': { rich_text: richText(cleaned.messageId || '') },
  };
  if (uploads.files.length) {
    properties.Attachments = { files: uploads.files.map(({ id, name }) => ({ type: 'file_upload', file_upload: { id }, name })) };
  }
  return { parent: { database_id: ticketsDatabaseId }, properties };
}

const NO_UPLOADS = { files: [], failed: [] };

// The Ticket with the email as its whole body: for a Tickets database without a default template.
export function createTicketRequest(cleaned, contactId, ticketsDatabaseId, uploads = NO_UPLOADS) {
  return {
    method: 'POST',
    url: API + '/pages',
    body: { ...ticketPage(cleaned, contactId, ticketsDatabaseId, uploads), children: emailBlocks(cleaned, uploads) },
  };
}

// The Ticket from the Tickets database's default template, which the Desk owner
// designs in Notion. Notion applies it in the background and refuses children
// alongside it; addEmailRequest then puts the email above the template's content.
// The Message-ID is left out until the email is in (storeMessageIdRequest): a
// retry after a failed add then creates the Ticket again instead of skipping it.
export function createTicketFromTemplateRequest(cleaned, contactId, ticketsDatabaseId, uploads = NO_UPLOADS) {
  const page = ticketPage(cleaned, contactId, ticketsDatabaseId, uploads);
  delete page.properties['Message-IDs'];
  return {
    method: 'POST',
    url: API + '/pages',
    body: { ...page, template: { type: 'default' } },
  };
}

export function storeMessageIdRequest(pageId, messageId) {
  return {
    method: 'PATCH',
    url: API + '/pages/' + pageId,
    body: { properties: { 'Message-IDs': { rich_text: richText(messageId || '') } } },
  };
}

// errorItem: what n8n's HTTP Request node puts on its error output. Notion answers
// a plain validation_error, so its message is the only way to tell this case apart.
export function isNoDefaultTemplateError(errorItem) {
  return /no default template/i.test(JSON.stringify(errorItem ?? {}));
}

export function addEmailRequest(pageId, cleaned, uploads = NO_UPLOADS) {
  return {
    method: 'PATCH',
    url: API + '/blocks/' + pageId + '/children',
    body: { children: emailBlocks(cleaned, uploads), position: { type: 'start' } },
  };
}

// ---- Same-thread follow-ups ----

const MAX_RICH_TEXT = 100; // rich text pieces per comment or property

// The oldest Ticket whose Message-IDs hold any of the ids (from threadMessageIds, src/email/thread.js).
// The ids keep their <angle brackets>, so one id never matches inside a longer one.
export function findThreadTicketRequest(messageIds, ticketsDatabaseId) {
  return {
    method: 'POST',
    url: API + '/databases/' + ticketsDatabaseId + '/query',
    body: {
      filter: { or: messageIds.map((id) => ({ property: 'Message-IDs', rich_text: { contains: id } })) },
      sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
      page_size: 1,
    },
  };
}

const MAX_COMMENT_FILES = 3; // attachments per comment

const bold = (s) => ({ type: 'text', text: { content: s.slice(0, MAX_TEXT) }, annotations: { bold: true } });
const commentAttachments = (files) => files.map(({ id }) => ({ type: 'file_upload', file_upload_id: id }));
const comment = (ticketId, richText, files) => ({
  method: 'POST',
  url: API + '/comments',
  body: { parent: { page_id: ticketId }, rich_text: richText, ...(files.length ? { attachments: commentAttachments(files) } : {}) },
});

// A follow-up as a comment: the author's name in bold, then the cleaned text,
// then a line per attachment that could not be stored. Starting with the name
// means a customer email never starts with the Reply marker.
// Stored attachments go on the comment, 3 at most (Notion's limit); the rest go
// on more comments of 3, each saying it continues the follow-up.
// Text past Notion's 100-piece limit (about 200,000 characters) is dropped, never the notes.
// uploads: the result of collectUploads (src/inbound/attachments.js).
export function addCommentRequests(ticketId, cleaned, uploads = NO_UPLOADS) {
  const name = cleaned.sender.name;
  const notes = uploads.failed.map(({ name: file, reason }) => '⚠️ Attachment not stored: ' + file + ' (' + reason + ')');
  const notesText = notes.length ? richText((cleaned.body ? '\n\n' : '\n') + notes.join('\n')) : [];
  const body = cleaned.body ? richText('\n' + cleaned.body).slice(0, MAX_RICH_TEXT - 1 - notesText.length) : [];
  const batches = [];
  for (let i = 0; i < uploads.files.length; i += MAX_COMMENT_FILES) batches.push(uploads.files.slice(i, i + MAX_COMMENT_FILES));
  const [first = [], ...rest] = batches;
  return [
    comment(ticketId, [bold(name), ...body, ...notesText].slice(0, MAX_RICH_TEXT), first),
    ...rest.map((files) => comment(ticketId, [bold(name + ' (attachments, continued)')], files)),
  ];
}

// Adds the follow-up's Message-ID to the Ticket's Message-IDs (one per line),
// so a later email that only answers this follow-up still finds the Ticket, and
// fetching the follow-up again is skipped as a duplicate (findTicketRequest).
// Sent after the comment, like storeMessageIdRequest: a failed comment is retried.
// ticket: the page from the findThreadTicketRequest result.
export function appendMessageIdRequest(ticket, messageId) {
  const stored = (ticket.properties['Message-IDs']?.rich_text ?? []).map((r) => r.plain_text ?? r.text?.content ?? '').join('');
  const ids = stored.split(/\s+/).filter(Boolean);
  if (messageId && !ids.includes(messageId)) ids.push(messageId);
  return {
    method: 'PATCH',
    url: API + '/pages/' + ticket.id,
    body: { properties: { 'Message-IDs': { rich_text: richText(ids.join('\n')) } } },
  };
}
