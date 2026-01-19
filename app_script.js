const SHEET_LINKS = 'Links';
const STATUS_TODO = 'TODO';
const STATUS_DONE = 'DONE';

const PROP_API_TOKEN = 'API_TOKEN';
const PROP_NOTIFY_EMAIL = 'NOTIFY_EMAIL';


const PROP_SPREADSHEET_ID = 'SPREADSHEET_ID';


function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty(PROP_SPREADSHEET_ID) || PROP_SPREADSHEET_ID;
  if (spreadsheetId) return SpreadsheetApp.openById(String(spreadsheetId));
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('No active spreadsheet');
    return ss;
  } catch (err) {
    throw new Error('Spreadsheet not set (Script Properties: SPREADSHEET_ID)');
  }
}

function setup_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_LINKS);
  if (!sheet) sheet = ss.insertSheet(SHEET_LINKS);
  const headerRange = sheet.getRange(1, 1, 1, 4);
  const header = headerRange.getValues()[0];
  if (
    header[0] !== 'URL' ||
    header[1] !== 'STATUS' ||
    header[2] !== 'ADDED_AT' ||
    header[3] !== 'LAST_SEEN_AT'
  ) {
    headerRange.setValues([['URL', 'STATUS', 'ADDED_AT', 'LAST_SEEN_AT']]);
  }
  sheet.setFrozenRows(1);
}

function doPost(e) {
  try {
    auth_(e);
    setup_();

    const sheet = getSpreadsheet_().getSheetByName(SHEET_LINKS);
    const bodyText = (e && e.postData && e.postData.contents) ? String(e.postData.contents) : '';
    let urls = [];
    
    let jsonBody = null;
    try {
      jsonBody = bodyText ? JSON.parse(bodyText) : null;
    } catch (err) {
      jsonBody = null;
    }
    if (jsonBody && Array.isArray(jsonBody.urls)) {
      urls = normalizeUdemyCourseUrlsFromArray_(jsonBody.urls);
    } else {
      urls = extractUdemyCourseUrlsFromText_(bodyText);
    }

    // return json_({ ok: true, urls, bodyText,jsonBody});

    const existing = readSheetMap_(sheet);
    const now = new Date();
    const newlyAdded = [];

    for (const url of urls) {
      const row = existing.get(url);
      if (!row) {
        sheet.appendRow([url, STATUS_TODO, now, now]);
        existing.set(url, { rowIndex: sheet.getLastRow(), status: STATUS_TODO });
        newlyAdded.push(url);
      } else {
        sheet.getRange(row.rowIndex, 4).setValue(now);
      }
    }

    const pending = readPendingUrls_(sheet);

    const notifyTo =
      (e && e.parameter && e.parameter.notifyTo) ||
      PropertiesService.getScriptProperties().getProperty(PROP_NOTIFY_EMAIL) || PROP_NOTIFY_EMAIL ;

    if (notifyTo) {
      const subject = `Udemy links update: +${newlyAdded.length} new, ${pending.length} unrolled`;
      const body =
        `New links:\n${newlyAdded.length ? newlyAdded.map(u => `- ${u}`).join('\n') : '(none)'}\n\n` +
        `Unrolled (STATUS != DONE):\n${pending.length ? pending.map(u => `- ${u}`).join('\n') : '(none)'}\n`;
      GmailApp.sendEmail(String(notifyTo), subject, body);
    }

    return json_({ ok: true, received: urls.length, added: newlyAdded.length, pending: pending.length });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function auth_(e) {
  const token = PropertiesService.getScriptProperties().getProperty(PROP_API_TOKEN) || PROP_API_TOKEN;
  if (!token) throw new Error('API token not set (Script Properties: API_TOKEN)');

  const authHeader = (e && e.headers && (e.headers.Authorization || e.headers.authorization))
    ? String(e.headers.Authorization || e.headers.authorization)
    : '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

  const queryToken = (e && e.parameter && e.parameter.token) ? String(e.parameter.token) : null;
  const provided = bearer || queryToken;

  if (!provided || provided !== token) throw new Error('Unauthorized');
}

function extractUdemyCourseUrlsFromText_(text) {
  const cleaned = String(text || '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");

  const candidates = cleaned.match(/https?:\/\/[^\s"'<>]+/g) || [];
  const out = [];

  for (let raw of candidates) {
    raw = raw.replace(/[)\].,;]+$/g, '');
    
    // Use regex instead of URL class for better compatibility in GAS
    // Host: udemy.com or *.udemy.com
    // Path: /course/SLUG...
    if (/^https?:\/\/([a-zA-Z0-9.-]+\.)?udemy\.com\/course\/([^\/?#]+)/i.test(raw)) {
       out.push(raw.split('#')[0]);
    }
  }

  return Array.from(new Set(out)).sort();
}

function normalizeUdemyCourseUrlsFromArray_(arr) {
  if (!Array.isArray(arr) || !arr.length) return [];
  const text = arr.map(v => String(v)).join('\n');
  return extractUdemyCourseUrlsFromText_(text);
}

function readSheetMap_(sheet) {
  const map = new Map();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return map;

  const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (let i = 0; i < values.length; i++) {
    const rowIndex = i + 2;
    const url = String(values[i][0] || '').trim();
    const status = String(values[i][1] || STATUS_TODO).trim() || STATUS_TODO;
    if (url) map.set(url, { rowIndex, status });
  }
  return map;
}

function readPendingUrls_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  return values
    .filter(r => String(r[0] || '').trim())
    .filter(r => String(r[1] || STATUS_TODO).trim().toUpperCase() !== STATUS_DONE)
    .map(r => String(r[0]).trim());
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
