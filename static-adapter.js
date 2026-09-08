/* Browser-only persistence layer for the static DTT Pulse web app. */
(() => {
  'use strict';
  const STORAGE_KEY = 'dtt-pulse-web-v1';
  const DOMAIN = () => window.DTTPulseDomain;
  const defaults = {
    timezone: 'America/Costa_Rica', dailyTarget: 70, dialCredit: 1,
    directions: ['outbound', 'inbound'], durationMode: 'unverified', durationField: 'duration',
    eligibleStates: ['complete', 'completed', 'no_answer', 'failed', 'busy', 'canceled', 'missed'], includeManualCalls: true,
  };
  const key = value => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
  const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const today = timezone => DOMAIN().reportingDate(new Date().toISOString(), timezone) || new Date().toISOString().slice(0, 10);
  const currentRange = timezone => {
    const end = today(timezone);
    const cursor = new Date(`${end}T12:00:00Z`);
    cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7));
    return { start: cursor.toISOString().slice(0, 10), end };
  };
  const emptyState = () => ({ settings: { ...defaults }, agents: [], calls: [], manual: [], imports: [] });
  let state;
  try {
    state = { ...emptyState(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') };
    if (!Array.isArray(state.agents) || !Array.isArray(state.calls) || !Array.isArray(state.manual)) state = emptyState();
  } catch { state = emptyState(); }
  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { throw Error('Your browser could not save this workspace. Free some storage and try again.'); }
  };
  const integration = { configured: false, connected: false, status: 'not_available', lastSync: null, lastError: null, pendingEvents: 0, durationVerified: true, scopeConfigured: false };
  const bootstrap = () => ({
    dataset: 'demo', settings: state.settings, agents: state.agents,
    teams: [...new Set(state.agents.map(agent => agent.team).filter(Boolean))].sort(), integration,
    auth: { required: false, authenticated: true, role: 'admin' }, range: currentRange(state.settings.timezone), imports: state.imports.slice(0, 20),
  });
  const query = path => new URL(path, 'https://dtt-pulse.local');
  const csvCell = value => `"${String(value ?? '').replace(/^[\s]*[=+@\-]/, "'$&").replaceAll('"', '""')}"`;
  const mergeAgents = incoming => {
    const agents = new Map(state.agents.map(agent => [String(agent.id), agent]));
    for (const agent of incoming) {
      const existing = agents.get(String(agent.id));
      agents.set(String(agent.id), existing ? { ...agent, ...existing, name: agent.name || existing.name, team: existing.team || agent.team } : agent);
    }
    state.agents = [...agents.values()];
  };
  const importCsv = body => {
    if (typeof body.csv !== 'string' || !body.csv.trim()) throw Error('Choose a CSV file containing call records.');
    const normalized = DOMAIN().normalizeCSV(body.csv, state.settings, state.agents);
    if (normalized.errors.length) return { inserted: 0, updated: 0, skipped: 0, warnings: normalized.warnings, errors: normalized.errors };
    const calls = new Map(state.calls.map(call => [String(call.id), call]));
    let inserted = 0, updated = 0, skipped = 0;
    for (const call of normalized.calls) {
      const existing = calls.get(String(call.id));
      if (existing && JSON.stringify(existing) === JSON.stringify(call)) { skipped++; continue; }
      calls.set(String(call.id), call); existing ? updated++ : inserted++;
    }
    mergeAgents(normalized.agents);
    state.calls = [...calls.values()];
    state.imports.unshift({ id: uuid(), filename: String(body.filename || 'Outreach export.csv').slice(0, 200), createdAt: new Date().toISOString(), inserted, updated, skipped, rows: normalized.totalRows, warnings: normalized.warnings });
    state.imports = state.imports.slice(0, 20); save();
    return { inserted, updated, skipped, warnings: normalized.warnings, errors: [] };
  };
  const report = url => ({ ...DOMAIN().aggregate(state.calls, state.agents, state.manual, state.settings, Object.fromEntries(url.searchParams)), dataset: 'demo', lastSync: null });
  async function request(path, options = {}) {
    const url = query(path); const method = options.method || 'GET';
    let body = {};
    if (options.body) { try { body = JSON.parse(options.body); } catch { throw Error('The request is invalid.'); } }
    if (url.pathname === '/api/bootstrap') return bootstrap();
    if (url.pathname === '/api/report') return report(url);
    if (url.pathname === '/api/import' && method === 'POST') return importCsv(body);
    if (url.pathname === '/api/settings' && method === 'PUT') {
      const next = { ...state.settings, ...(body.settings || {}) };
      try { new Intl.DateTimeFormat('en-CA', { timeZone: next.timezone }).format(new Date()); } catch { throw Error('Choose a valid reporting timezone.'); }
      if (!Number.isFinite(next.dailyTarget) || next.dailyTarget <= 0 || next.dailyTarget > 1440 || !Number.isFinite(next.dialCredit) || next.dialCredit < 0 || next.dialCredit > 60) throw Error('Enter a valid daily target and dial credit.');
      state.settings = next; save(); return state.settings;
    }
    if (url.pathname === '/api/manual' && method === 'POST') {
      const agent = state.agents.find(item => item.id === body.userId);
      if (!agent || agent.active === false) throw Error('Select an active team member.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '') || !Number.isFinite(Number(body.minutes)) || Number(body.minutes) <= 0 || Number(body.minutes) > 1440) throw Error('Enter a valid date and 1–1,440 minutes.');
      const entry = { id: uuid(), userId: agent.id, rep: agent.name, date: body.date, minutes: Number(body.minutes), source: body.source, note: String(body.note || '').slice(0, 2000), createdAt: new Date().toISOString(), createdBy: 'Browser workspace' };
      state.manual.push(entry); save(); return entry;
    }
    if (url.pathname.startsWith('/api/manual/') && method === 'DELETE') {
      const id = decodeURIComponent(url.pathname.split('/').pop()); state.manual = state.manual.filter(entry => entry.id !== id); save(); return { ok: true };
    }
    if (url.pathname === '/api/agents' && method === 'POST') {
      const name = String(body.name || '').trim(), team = String(body.team || '').trim(); if (!name || !team) throw Error('Name and team are required.');
      const agent = { id: `browser:${uuid()}`, name, team, active: body.active !== false }; state.agents.push(agent); save(); return agent;
    }
    if (url.pathname.startsWith('/api/agents/') && method === 'PUT') {
      const id = decodeURIComponent(url.pathname.split('/').pop()), agent = state.agents.find(item => item.id === id);
      if (!agent) throw Error('Team member not found.');
      const name = String(body.name || '').trim(), team = String(body.team || '').trim(); if (!name || !team) throw Error('Name and team are required.');
      Object.assign(agent, { name, team, active: body.active !== false });
      for (const call of state.calls) if (call.userId === id) Object.assign(call, { rep: name, team });
      for (const entry of state.manual) if (entry.userId === id) entry.rep = name;
      save(); return agent;
    }
    if (url.pathname === '/api/export') {
      const result = report(url); const heading = ['Agent', 'Team', 'Dials', 'Call minutes', 'Dial credits', 'Manual minutes', 'Total DTT minutes', 'Target minutes', 'Attainment %', 'Report status'];
      return [heading, ...result.agents.map(agent => [agent.name, agent.team, agent.dials, agent.callMinutes, agent.dialCredits, agent.manualMinutes, agent.totalDtt, agent.target, agent.attainment, result.summary.isComplete ? 'Complete' : 'Partial: duration unverified'])].map(row => row.map(csvCell).join(',')).join('\n');
    }
    if (url.pathname === '/api/reset' && method === 'POST') { state = emptyState(); save(); return { ok: true }; }
    throw Error('This feature is not available in the browser-only version.');
  }
  window.DTTPulsePreview = { request };
})();
