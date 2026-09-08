/* Generated from shared/domain.mjs by scripts/build-domain.mjs. */
(() => {
'use strict';
/** Shared calculations. All durations are seconds internally; DTT is minutes. */
const DEFAULT_SETTINGS = Object.freeze({
  timezone: 'America/Costa_Rica', dailyTarget: 70, dialCredit: 1,
  directions: Object.freeze(['outbound', 'inbound']), durationMode: 'unverified', durationField: 'duration',
  eligibleStates: Object.freeze(['complete', 'completed', 'no_answer', 'failed', 'busy', 'canceled', 'missed']),
  includeManualCalls: true,
});

const clean = value => String(value ?? '').trim();
const nameKey = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
const headerKey = value => nameKey(value).replace(/[^a-z0-9]/g, '');
const stateKey = value => nameKey(value).replace(/[\s-]+/g, '_');
const finiteNonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const provisionalStates = new Set(['ringing', 'in_progress', 'queued', 'initiated', 'connecting']);
const dateFormatters = new Map();

function options(settings = {}) { return { ...DEFAULT_SETTINGS, ...settings }; }

/** RFC 4180 style CSV, including BOM, quoted newlines, and escaped quotes. */
function parseCSV(input) {
  const text = String(input ?? '').replace(/^\uFEFF/, '');
  const records = [], errors = [];
  let row = [], field = '', quoted = false, afterQuote = false, touched = false;
  const endField = () => { row.push(field); field = ''; afterQuote = false; };
  const endRow = () => {
    endField();
    if (row.some(value => value.trim() !== '')) records.push(row);
    row = []; touched = false;
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index++; }
        else { quoted = false; afterQuote = true; }
      } else field += char;
      continue;
    }
    if (char === ',') { endField(); touched = true; continue; }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      endRow(); continue;
    }
    if (afterQuote) {
      if (char === ' ' || char === '\t') continue;
      errors.push(`Unexpected character after a closing quote near character ${index + 1}.`);
      afterQuote = false;
    }
    if (char === '"') {
      if (field.length !== 0) errors.push(`Unexpected quote near character ${index + 1}.`);
      else { quoted = true; touched = true; continue; }
    }
    field += char; touched = true;
  }
  if (quoted) errors.push('The CSV ends inside a quoted field.');
  if (touched || field.length || row.length || afterQuote) endRow();
  const headers = records.shift()?.map(clean) ?? [];
  if (!headers.length) errors.push('The CSV is empty or has no header row.');
  const seen = new Set();
  headers.forEach((header, index) => {
    const key = headerKey(header);
    if (!key) errors.push(`Header ${index + 1} is empty.`);
    if (seen.has(key)) errors.push(`Duplicate CSV header: ${header}.`);
    seen.add(key);
  });
  records.forEach((record, index) => {
    if (record.length !== headers.length) errors.push(`Row ${index + 2} has ${record.length} columns; expected ${headers.length}.`);
  });
  return { headers, rows: records, errors };
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function hasOffset(value) { return /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(clean(value)); }

/** Returns a reporting calendar day only for a valid timestamp with explicit offset. */
function reportingDate(iso, timezone = DEFAULT_SETTINGS.timezone) {
  const value = clean(iso);
  if (!hasOffset(value)) return null;
  const leadingDate = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (leadingDate && !validDate(leadingDate[1])) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    let formatter = dateFormatters.get(timezone);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
      if (dateFormatters.size >= 32) dateFormatters.delete(dateFormatters.keys().next().value);
      dateFormatters.set(timezone, formatter);
    }
    const parts = formatter.formatToParts(date);
    const get = type => parts.find(part => part.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch { return null; }
}

function sourceDate(value, timezone) {
  const raw = clean(value);
  if (hasOffset(raw)) {
    const date = reportingDate(raw, timezone);
    return date ? { date, dateSource: 'timestamp', timezoneAmbiguous: false } : null;
  }
  let written = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[ T]|$)/)?.[1];
  if (!written) {
    const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T]|$)/);
    if (us) written = `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  }
  if (!written) {
    const text = raw.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})(?:\s|$)/);
    if (text) {
      const month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(text[1].slice(0,3).toLowerCase()) + 1;
      if (month) written = `${text[3]}-${String(month).padStart(2, '0')}-${text[2].padStart(2, '0')}`;
    }
  }
  return written && validDate(written) ? { date: written, dateSource: 'written', timezoneAmbiguous: true } : null;
}

function duration(value, allowColon = true) {
  const text = clean(value);
  if (!text) return { value: null, warning: 'Duration is missing.' };
  let seconds;
  if (allowColon && /^(?:\d+:)?\d+:\d+(?:\.\d+)?$/.test(text)) {
    const pieces = text.split(':').map(Number);
    if (pieces.at(-1) >= 60 || (pieces.length === 3 && pieces[1] >= 60)) return { value: null, warning: 'Duration has invalid clock components.' };
    seconds = pieces.reduce((total, part) => total * 60 + part, 0);
  } else if (/^\d+(?:\.\d+)?$/.test(text)) seconds = Number(text);
  if (!finiteNonnegative(seconds)) return { value: null, warning: 'Duration must be a finite, nonnegative number of seconds or a valid clock duration.' };
  return { value: seconds, warning: null };
}

function normalizeCSV(text, settings = {}, roster = []) {
  const config = options(settings), parsed = parseCSV(text);
  const errors = [...parsed.errors], warnings = [];
  const columns = new Map(parsed.headers.map((header, index) => [headerKey(header), index]));
  const has = (...names) => names.some(name => columns.has(headerKey(name)));
  const read = (row, ...names) => {
    for (const name of names) if (columns.has(headerKey(name))) return clean(row[columns.get(headerKey(name))]);
    return '';
  };
  for (const [label, aliases] of [
    ['Id', ['Id', 'Call Id']], ['Created At', ['Created At', 'Time & Date', 'Date']],
    ['State', ['State', 'Call State']], ['Direction', ['Direction']],
  ]) if (!has(...aliases)) errors.push(`Required CSV header missing: ${label}.`);
  if (!has('User Name', 'User', 'Rep', 'User First Name', 'User Id')) errors.push('CSV needs User Name, User First Name, or User Id to identify agents.');
  if (!has('Duration in Seconds', 'Duration')) errors.push('CSV needs a Duration in Seconds or Duration column.');
  if (errors.length) return { calls: [], agents: [], warnings, errors, totalRows: parsed.rows.length };
  const rosterList = roster instanceof Map ? [...roster.values()] : Array.isArray(roster) ? roster : Object.entries(roster || {}).flatMap(([team, names]) => names.map(name => ({ id: `name:${nameKey(name)}`, name, team, active: true })));
  const byId = new Map(rosterList.map(agent => [String(agent.id), agent]));
  const nameCandidates = new Map();
  for (const agent of byId.values()) {
    const key = nameKey(agent.name);
    if (!nameCandidates.has(key)) nameCandidates.set(key, []);
    nameCandidates.get(key).push(agent);
  }
  const byName = new Map([...nameCandidates].filter(([, candidates]) => candidates.length === 1).map(([key, candidates]) => [key, candidates[0]]));
  const calls = new Map(), agents = new Map();
  parsed.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const id = read(row, 'Id', 'Call Id');
    const repName = read(row, 'User Name', 'User', 'Rep') || [read(row, 'User First Name'), read(row, 'User Last Name')].filter(Boolean).join(' ');
    const suppliedUserId = read(row, 'User Id');
    const rosterAgent = byId.get(suppliedUserId) || byName.get(nameKey(repName));
    const rep = repName || rosterAgent?.name || '';
    const createdAt = read(row, 'Created At', 'Time & Date', 'Date');
    const dateInfo = sourceDate(createdAt, config.timezone);
    const state = stateKey(read(row, 'State', 'Call State'));
    const direction = stateKey(read(row, 'Direction'));
    const invalid = [];
    if (!id) invalid.push('call ID is missing');
    if (!rep) invalid.push('agent name is missing or cannot be resolved');
    if (!suppliedUserId && (nameCandidates.get(nameKey(repName))?.length || 0) > 1) invalid.push('agent name matches multiple roster users; a User Id is required');
    if (!dateInfo) invalid.push('Created At is invalid');
    if (!state) invalid.push('State is missing');
    if (!['inbound', 'outbound'].includes(direction)) invalid.push('Direction must be inbound or outbound');
    if (invalid.length) { errors.push(`Row ${rowNumber}: ${invalid.join('; ')}.`); return; }
    const userId = suppliedUserId || String(rosterAgent?.id || `name:${nameKey(rep)}`);
    const team = clean(rosterAgent?.team || read(row, 'Team', 'User Team')) || 'Unassigned';
    const parsedDuration = duration(read(row, 'Duration in Seconds', 'Duration'), !has('Duration in Seconds'));
    const rowWarnings = [];
    if (parsedDuration.warning) rowWarnings.push(parsedDuration.warning);
    if (dateInfo.timezoneAmbiguous) rowWarnings.push('CSV date has no timezone; its written calendar date is preserved.');
    const updatedAt = read(row, 'Updated At') || null;
    if (updatedAt && !sourceDate(updatedAt, config.timezone)) rowWarnings.push('Updated At is invalid; it cannot establish update ordering.');
    const call = {
      id, userId, rep, team, createdAt, updatedAt, ...dateInfo, direction, state,
      durationSec: parsedDuration.value, durationVerified: parsedDuration.value !== null,
      purpose: read(row, 'Purpose'), disposition: read(row, 'Disposition'), note: read(row, 'Note', 'Notes'),
      source: 'csv', warnings: rowWarnings, deleted: false,
      isManual: ['true', '1', 'yes'].includes(read(row, 'Manual', 'Is Manual').toLowerCase()),
    };
    if (calls.has(id)) warnings.push(`Duplicate call ID ${id} at row ${rowNumber}; the last occurrence was retained.`);
    calls.set(id, call);
    agents.set(userId, { id: userId, name: rep, team, active: rosterAgent?.active !== false });
    rowWarnings.forEach(warning => warnings.push(`Row ${rowNumber}: ${warning}`));
  });
  return { calls: [...calls.values()], agents: [...agents.values()], warnings, errors, totalRows: parsed.rows.length };
}

/** Normalize API calls without assigning undocumented duration semantics. */
function normalizeOutreach(resource, users = new Map(), settings = {}) {
  if (!resource || typeof resource !== 'object') return null;
  const config = options(settings), attrs = resource.attributes || resource;
  const id = clean(resource.id), userId = clean(resource.relationships?.user?.data?.id ?? attrs.userId);
  const agent = users instanceof Map ? users.get(userId) : users[userId];
  const createdAt = clean(attrs.createdAt), dateInfo = sourceDate(createdAt, config.timezone);
  if (!id || !userId || !dateInfo) return null;
  const warnings = [], mode = config.durationMode;
  let durationSec = null;
  if (mode === 'field') {
    const parsedDuration = duration(attrs[config.durationField || 'duration'], false);
    durationSec = parsedDuration.value;
    if (parsedDuration.warning) warnings.push(parsedDuration.warning);
  } else if (mode === 'answered_to_completed') {
    const answered = clean(attrs.answeredAt), completed = clean(attrs.completedAt);
    if (hasOffset(answered) && hasOffset(completed) && reportingDate(answered, config.timezone) && reportingDate(completed, config.timezone)) {
      const seconds = (Date.parse(completed) - Date.parse(answered)) / 1000;
      if (finiteNonnegative(seconds)) durationSec = seconds;
    }
    if (durationSec === null) warnings.push('A valid answeredAt-to-completedAt duration is unavailable.');
  } else warnings.push('Outreach duration mapping has not been verified against the CSV export.');
  if (dateInfo.timezoneAmbiguous) warnings.push('Call timestamp has no timezone; its written calendar date is preserved.');
  const rawUpdatedAt = clean(attrs.updatedAt);
  const updatedAt = rawUpdatedAt && hasOffset(rawUpdatedAt) && reportingDate(rawUpdatedAt, config.timezone) ? new Date(rawUpdatedAt).toISOString() : null;
  if (rawUpdatedAt && !updatedAt) warnings.push('Updated At is invalid; it cannot establish update ordering.');
  const direction = stateKey(attrs.direction);
  if (!['inbound','outbound'].includes(direction)) warnings.push('Call direction is unknown; the call is excluded from eligible DTT.');
  return {
    id, userId, rep: agent?.name || `Outreach user ${userId}`, team: agent?.team || 'Unassigned',
    createdAt, updatedAt, ...dateInfo, direction, state: stateKey(attrs.state), durationSec,
    durationVerified: durationSec !== null, purpose: clean(attrs.purpose ?? attrs.callPurpose),
    disposition: clean(attrs.disposition ?? attrs.callDisposition), note: clean(attrs.note ?? attrs.notes),
    source: 'outreach', warnings, deleted: false, isManual: attrs.isManual === true || attrs.manual === true,
  };
}

function dayRange(start, end) {
  if (!validDate(start) || !validDate(end) || start > end) return [];
  const days = Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000);
  if (days > 3660) throw new RangeError('Reporting ranges cannot exceed ten years.');
  return Array.from({ length: days + 1 }, (_, index) => new Date(Date.parse(`${start}T12:00:00Z`) + index * 86400000).toISOString().slice(0, 10));
}

function uniqueLatest(items) {
  const map = new Map();
  for (const item of items) {
    if (!item || !clean(item.id)) continue;
    const id = String(item.id), old = map.get(id);
    const oldTime = Date.parse(old?.updatedAt), newTime = Date.parse(item.updatedAt);
    if (old && Number.isFinite(oldTime) && Number.isFinite(newTime) && oldTime > newTime) continue;
    map.set(id, item);
  }
  return [...map.values()];
}

const blankMetrics = () => ({ dials: 0, callMinutes: 0, dialCredits: 0, manualMinutes: 0, totalDtt: 0, target: 0, provisional: 0, unverified: 0 });

function aggregate(calls = [], agents = [], manual = [], settings = {}, filters = {}) {
  const config = options(settings);
  const today = reportingDate(new Date().toISOString(), config.timezone);
  if (!today) throw new RangeError('The reporting timezone is invalid.');
  const allCalls = uniqueLatest(calls).filter(call => !call.deleted).map(call => {
    const derivedDate = call.dateSource !== 'written' && hasOffset(call.createdAt) ? reportingDate(call.createdAt, config.timezone) : null;
    return { ...call, date: derivedDate || call.date };
  });
  const allManual = uniqueLatest(manual).filter(entry => finiteNonnegative(entry.minutes));
  const possibleDates = [...allCalls, ...allManual].map(item => item.date).filter(validDate).sort();
  const start = filters.start || possibleDates[0] || today;
  const end = filters.end || possibleDates.at(-1) || today;
  const dates = dayRange(start, end);
  const dateSet = new Set(dates), query = nameKey(filters.search), teamFilter = clean(filters.team || 'all');
  const agentMap = new Map(agents.filter(agent => clean(agent.id)).map(agent => [String(agent.id), { ...agent, id: String(agent.id) }]));
  for (const item of [...allCalls, ...allManual]) {
    if (clean(item.userId) && !agentMap.has(String(item.userId))) agentMap.set(String(item.userId), { id: String(item.userId), name: item.rep || String(item.userId), team: item.team || 'Unassigned', active: true });
  }
  const teamMatches = agent => teamFilter.toLowerCase() === 'all' || agent?.team === teamFilter;
  const identityMatches = agent => !query || nameKey(`${agent?.name || ''} ${agent?.team || ''}`).includes(query);
  const rowMatches = (item, agent) => identityMatches(agent) || nameKey(`${item.purpose || ''} ${item.disposition || ''} ${item.note || ''}`).includes(query);
  const selectedCalls = allCalls.filter(call => dateSet.has(call.date) && teamMatches(agentMap.get(String(call.userId))) && rowMatches(call, agentMap.get(String(call.userId))));
  const selectedManual = allManual.filter(entry => dateSet.has(entry.date) && teamMatches(agentMap.get(String(entry.userId))) && rowMatches(entry, agentMap.get(String(entry.userId))));
  const activityIds = new Set([...selectedCalls, ...selectedManual].map(item => String(item.userId)));
  const selectedAgents = [...agentMap.values()].filter(agent => teamMatches(agent) && ((agent.active !== false && identityMatches(agent)) || activityIds.has(agent.id)));
  const targetDays = dates.filter(date => date <= today && ![0,6].includes(new Date(`${date}T12:00:00Z`).getUTCDay()));
  const targetDaySet = new Set(targetDays);
  const dailyTarget = finiteNonnegative(config.dailyTarget) ? config.dailyTarget : DEFAULT_SETTINGS.dailyTarget;
  const dialCredit = finiteNonnegative(config.dialCredit) ? config.dialCredit : DEFAULT_SETTINGS.dialCredit;
  const rows = new Map(selectedAgents.map(agent => [agent.id, {
    id: agent.id, name: agent.name, team: agent.team || 'Unassigned', ...blankMetrics(),
    target: agent.active !== false ? targetDays.length * dailyTarget : 0,
    attainment: null, daily: Object.fromEntries(dates.map(date => [date, 0])),
  }]));
  const rosterAgents = selectedAgents.filter(agent => agent.active !== false).length;
  const days = new Map(dates.map(date => [date, { date, ...blankMetrics(), target: targetDaySet.has(date) ? rosterAgents * dailyTarget : 0 }]));
  const allowedStates = new Set(config.eligibleStates.map(stateKey)), allowedDirections = new Set(config.directions.map(stateKey));
  let excluded = 0;
  for (const call of selectedCalls) {
    const row = rows.get(String(call.userId)), day = days.get(call.date);
    if (!row || !day) continue;
    if (!allowedDirections.has(stateKey(call.direction)) || (!config.includeManualCalls && call.isManual)) { excluded++; continue; }
    const state = stateKey(call.state);
    if (provisionalStates.has(state)) { row.provisional++; day.provisional++; continue; }
    if (!allowedStates.has(state)) { excluded++; continue; }
    const verified = call.durationVerified === true && finiteNonnegative(call.durationSec) && !(call.source === 'outreach' && call.durationSource !== 'csv' && config.durationMode === 'unverified');
    const callMinutes = verified ? call.durationSec / 60 : 0;
    const dtt = callMinutes + dialCredit;
    for (const metrics of [row, day]) {
      metrics.dials++; metrics.callMinutes += callMinutes; metrics.dialCredits += dialCredit; metrics.totalDtt += dtt;
      if (!verified) metrics.unverified++;
    }
    row.daily[call.date] += dtt;
  }
  for (const entry of selectedManual) {
    const row = rows.get(String(entry.userId)), day = days.get(entry.date);
    if (!row || !day) continue;
    for (const metrics of [row, day]) { metrics.manualMinutes += entry.minutes; metrics.totalDtt += entry.minutes; }
    row.daily[entry.date] += entry.minutes;
  }
  const resultAgents = [...rows.values()].map(row => ({ ...row, attainment: row.target > 0 ? row.totalDtt / row.target * 100 : null, isComplete: row.unverified === 0 }));
  resultAgents.sort((a, b) => b.totalDtt - a.totalDtt || a.name.localeCompare(b.name));
  const summary = { ...blankMetrics(), activeAgents: resultAgents.filter(row => row.dials > 0 || row.manualMinutes > 0 || row.provisional > 0).length, rosterAgents, attainment: null };
  for (const row of resultAgents) for (const key of Object.keys(blankMetrics())) summary[key] += row[key];
  summary.attainment = summary.target > 0 ? summary.totalDtt / summary.target * 100 : null;
  summary.isComplete = summary.unverified === 0;
  summary.excluded = excluded;
  const warnings = [];
  if (summary.unverified) warnings.push(`DTT totals are partial: ${summary.unverified} eligible call(s) have missing or unverified duration. Their dial credits are included.`);
  if (summary.provisional) warnings.push(`${summary.provisional} ongoing call(s) are excluded from finalized DTT.`);
  if (excluded) warnings.push(`${excluded} call(s) are excluded by direction, state, or manual-call eligibility settings.`);
  if (selectedCalls.some(call => call.timezoneAmbiguous)) warnings.push('Some CSV dates have no timezone; their written calendar dates are preserved.');
  return { summary, daily: [...days.values()].map(day => ({ ...day, isComplete: day.unverified === 0 })), agents: resultAgents, calls: selectedCalls, manual: selectedManual, dates, warnings };
}

window.DTTPulseDomain = Object.freeze({ DEFAULT_SETTINGS, parseCSV, normalizeCSV, normalizeOutreach, aggregate, reportingDate });
})();
