#!/usr/bin/env node
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_VAULT = 'C:/Users/Rick/Documents/Rick Second Brain - Jarvis';
const PROJECT_FOLDER = '02 Företag - Anderssons Isolering/Projekt';
const INDEX_FILE = `${PROJECT_FOLDER}/Pågående projekt.md`;
const STATE_DIR = '.tidapp-obsidian-sync';
const STATE_FILE = 'state.json';

loadDotenv(path.join(process.cwd(), '.env'));

const config = {
  apiUrl: trimSlash(requiredEnv('TIDAPP_API_URL')),
  email: requiredEnv('TIDAPP_EMAIL'),
  password: requiredEnv('TIDAPP_PASSWORD'),
  vaultPath: process.env.OBSIDIAN_VAULT_PATH || DEFAULT_VAULT,
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || '60000'),
  once: process.argv.includes('--once'),
  limit: Number(process.env.SYNC_EVENT_LIMIT || '50'),
};

async function main() {
  console.log(`[obsidian-bridge] Startar mot ${config.apiUrl}`);
  do {
    try {
      await syncOnce();
    } catch (error) {
      console.error('[obsidian-bridge] Sync-fel:', error?.stack || error);
    }

    if (config.once) break;
    await sleep(config.pollIntervalMs);
  } while (true);
}

async function syncOnce() {
  const token = await login();
  const { events } = await api(token, `/obsidian-sync/events?limit=${config.limit}`);

  if (!events?.length) {
    console.log('[obsidian-bridge] Inga väntande events.');
    return;
  }

  const state = await readState();
  const grouped = groupBy(events, (event) => event.projectId || `event:${event.id}`);

  for (const [projectId, projectEvents] of grouped) {
    try {
      if (!projectId || projectId.startsWith('event:')) {
        for (const event of projectEvents) await ack(token, event.id);
        continue;
      }

      const hasPermanentDelete = projectEvents.some(
        (event) => event.eventType === 'PROJECT_DELETED' || event.payload?.permanent
      );

      if (hasPermanentDelete) {
        await markProjectDeleted(projectId, projectEvents, state);
      } else {
        const snapshot = await api(token, `/obsidian-sync/projects/${projectId}/snapshot`);
        await writeProjectNote(snapshot, state);
      }

      for (const event of projectEvents) await ack(token, event.id);
      await writeState(state);
    } catch (error) {
      const message = String(error?.stack || error).slice(0, 4500);
      console.error(`[obsidian-bridge] Fel för projekt ${projectId}:`, message);
      for (const event of projectEvents) await reportError(token, event.id, message);
    }
  }

  await updateProjectIndex(state);
}

async function login() {
  const result = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: config.email, password: config.password }),
  });
  if (!result.token) throw new Error('Login saknade token');
  return result.token;
}

async function api(token, endpoint) {
  return request(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function ack(token, id) {
  await request(`/obsidian-sync/events/${id}/ack`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: '{}',
  });
}

async function reportError(token, id, error) {
  await request(`/obsidian-sync/events/${id}/error`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ error }),
  });
}

async function request(endpoint, options = {}) {
  const response = await fetch(`${config.apiUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text}`);
  return data;
}

async function writeProjectNote(snapshot, state) {
  const { project, customer, metrics, timeEntries, materials, generatedAt } = snapshot;
  const projectDir = path.join(config.vaultPath, PROJECT_FOLDER);
  await fs.mkdir(projectDir, { recursive: true });

  const filename = `${safeFileName(project.code)} ${safeFileName(project.name)}.md`.trim();
  const relativePath = state.projectNotes?.[project.id] || `${PROJECT_FOLDER}/${filename}`;
  const fullPath = path.join(config.vaultPath, relativePath);

  let existing = '';
  try {
    existing = await fs.readFile(fullPath, 'utf8');
  } catch {
    existing = createBaseNote(project);
  }

  let next = upsertBlock(existing, 'tidapp:frontmatter', renderFrontmatter(project, customer, metrics, generatedAt));
  next = next.replace(/^# .+$/m, `# ${project.code} ${project.name}`);
  next = upsertBlock(next, 'tidapp:summary', renderSummary(project, customer, metrics, generatedAt));
  next = upsertBlock(next, 'tidapp:hours', renderHours(timeEntries, metrics));
  next = upsertBlock(next, 'tidapp:materials', renderMaterials(materials, metrics));
  next = upsertBlock(next, 'tidapp:log', renderSyncLog(snapshot));

  await atomicWrite(fullPath, next);

  state.projectNotes ||= {};
  state.projects ||= {};
  state.projectNotes[project.id] = relativePath;
  state.projects[project.id] = {
    code: project.code,
    name: project.name,
    customer: customer?.name || '',
    active: project.active,
    status: project.status,
    totalHours: metrics.totalHours,
    cost: metrics.laborCost + metrics.materialCost,
    result: metrics.projectResult,
    margin: metrics.marginPercent,
    lastSync: generatedAt,
    relativePath,
  };
}

async function markProjectDeleted(projectId, events, state) {
  const notePath = state.projectNotes?.[projectId];
  const payload = events.find((event) => event.payload)?.payload || {};
  if (!notePath) return;

  const fullPath = path.join(config.vaultPath, notePath);
  let existing = await fs.readFile(fullPath, 'utf8');
  existing = upsertBlock(
    existing,
    'tidapp:summary',
    `**Projektet är raderat/inaktiverat i Tidapp.**\n\n- Senaste händelse: ${new Date().toISOString()}\n- Kod: ${payload.code || ''}\n- Namn: ${payload.name || ''}`
  );
  await atomicWrite(fullPath, existing);

  if (state.projects?.[projectId]) {
    state.projects[projectId].active = false;
    state.projects[projectId].status = 'DELETED';
    state.projects[projectId].lastSync = new Date().toISOString();
  }
}

function createBaseNote(project) {
  return `<!-- tidapp:frontmatter:start -->\n<!-- tidapp:frontmatter:end -->\n\n# ${project.code} ${project.name}\n\n## Uppföljning / Verklig kostnad\n\n<!-- tidapp:summary:start -->\n<!-- tidapp:summary:end -->\n\n### Timmar\n<!-- tidapp:hours:start -->\n<!-- tidapp:hours:end -->\n\n### Material som används\n<!-- tidapp:materials:start -->\n<!-- tidapp:materials:end -->\n\n### Sync-logg\n<!-- tidapp:log:start -->\n<!-- tidapp:log:end -->\n\n## Egna anteckningar\n\n`;
}

function renderFrontmatter(project, customer, metrics, generatedAt) {
  return `---\ntidappProjectId: "${project.id}"\nprojectCode: "${escapeYaml(project.code)}"\nprojectName: "${escapeYaml(project.name)}"\ncustomer: "${escapeYaml(customer?.name || '')}"\nstatus: "${project.status}"\nactive: ${project.active}\nlastTidappSync: "${generatedAt}"\ntotalHours: ${round(metrics.totalHours)}\nmaterialCost: ${round(metrics.materialCost)}\nlaborCost: ${round(metrics.laborCost)}\nprojectResult: ${metrics.projectResult == null ? 'null' : round(metrics.projectResult)}\nmarginPercent: ${metrics.marginPercent == null ? 'null' : round(metrics.marginPercent)}\n---`;
}

function renderSummary(project, customer, metrics, generatedAt) {
  return [
    `Automatiskt uppdaterad från Tidapp: ${formatDateTime(generatedAt)}`,
    '',
    `- Kund: ${customer?.name || 'Ej angivet'}`,
    `- Status: ${project.status}${project.active ? '' : ' / inaktiv'}`,
    `- Plats: ${project.site || 'Ej angivet'}`,
    `- Affärsmodell: ${project.billingModel}`,
    `- Anbud/fast pris: ${money(project.fixedPrice)}`,
    `- Budget timmar: ${project.budgetHours ?? 'Ej angivet'}`,
    `- Faktiska timmar: ${round(metrics.totalHours)} h`,
    `- Arbetskostnad: ${money(metrics.laborCost)}`,
    `- Materialkostnad: ${money(metrics.materialCost)}`,
    `- Total kostnad: ${money(metrics.laborCost + metrics.materialCost)}`,
    `- Resultat: ${money(metrics.projectResult)}`,
    `- Marginal: ${metrics.marginPercent == null ? 'Ej angivet' : `${round(metrics.marginPercent)} %`}`,
    '- Moms: Projektuppföljning exkl. moms. Omvänd byggmoms används där det gäller.',
    metrics.warnings?.length ? `- Varningar: ${metrics.warnings.join(', ')}` : '- Varningar: Inga',
  ].join('\n');
}

function renderHours(entries, metrics) {
  const byUser = new Map();
  for (const entry of entries) {
    const name = entry.user?.name || 'Okänd';
    const current = byUser.get(name) || { hours: 0, cost: 0 };
    current.hours += entry.hours;
    current.cost += entry.hours * (entry.user?.hourlyCost || 0);
    byUser.set(name, current);
  }

  const rows = [...byUser.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'sv'))
    .map(([name, row]) => `- ${name}: ${round(row.hours)} h, kostnad ${money(row.cost)}`);

  return [
    `- Totalt: ${round(metrics.totalHours)} h`,
    `- Fakturerbara timmar: ${round(metrics.billableHours)} h`,
    `- Arbetskostnad: ${money(metrics.laborCost)}`,
    '',
    rows.length ? rows.join('\n') : 'Inga tidrader registrerade.',
  ].join('\n');
}

function renderMaterials(materials, metrics) {
  const rows = materials.map((item) => {
    const cost = item.quantity * (item.purchasePrice ?? item.unitPrice ?? 0);
    return `- ${formatDate(item.date)}: ${item.articleName}, ${round(item.quantity)} ${item.unit}, kostnad ${money(cost)}${item.note ? ` — ${item.note}` : ''}`;
  });

  return [
    `- Materialkostnad: ${money(metrics.materialCost)}`,
    `- Material försäljningsvärde: ${money(metrics.materialSalesValue)}`,
    '',
    rows.length ? rows.join('\n') : 'Inget material registrerat.',
  ].join('\n');
}

function renderSyncLog(snapshot) {
  return `- ${formatDateTime(snapshot.generatedAt)}: Synkad från Tidapp (${snapshot.timeEntries.length} tidrader, ${snapshot.materials.length} materialrader).`;
}

async function updateProjectIndex(state) {
  const indexPath = path.join(config.vaultPath, INDEX_FILE);
  let existing = '';
  try {
    existing = await fs.readFile(indexPath, 'utf8');
  } catch {
    existing = '# Pågående projekt\n\n';
  }

  const projects = Object.values(state.projects || {})
    .filter((project) => project.active !== false)
    .sort((a, b) => `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, 'sv'));

  const content = projects.length
    ? projects.map((project) => {
        const name = path.basename(project.relativePath, '.md');
        return `- [ ] [[${name}]] — ${round(project.totalHours)} h, kostnad ${money(project.cost)}, resultat ${money(project.result)}, marginal ${project.margin == null ? 'Ej angivet' : `${round(project.margin)} %`}`;
      }).join('\n')
    : 'Inga Tidapp-synkade pågående projekt.';

  const next = upsertBlock(existing, 'tidapp:project-index', content);
  await atomicWrite(indexPath, next);
}

function upsertBlock(content, key, inner) {
  const start = `<!-- ${key}:start -->`;
  const end = `<!-- ${key}:end -->`;
  const block = `${start}\n${inner.trim()}\n${end}`;
  const regex = new RegExp(`${escapeRegex(start)}[\\s\\S]*?${escapeRegex(end)}`);
  if (regex.test(content)) return content.replace(regex, block);
  return `${content.trimEnd()}\n\n${block}\n`;
}

async function readState() {
  const statePath = path.join(config.vaultPath, STATE_DIR, STATE_FILE);
  try {
    return JSON.parse(await fs.readFile(statePath, 'utf8'));
  } catch {
    return { projectNotes: {}, projects: {} };
  }
}

async function writeState(state) {
  const dir = path.join(config.vaultPath, STATE_DIR);
  await fs.mkdir(dir, { recursive: true });
  await atomicWrite(path.join(dir, STATE_FILE), JSON.stringify(state, null, 2));
}

async function atomicWrite(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, filePath);
}

function groupBy(items, getKey) {
  const map = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function safeFileName(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function money(value) {
  if (value == null || Number.isNaN(Number(value))) return 'Ej angivet';
  return `${new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))} kr`;
}

function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatDate(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : 'Utan datum';
}

function formatDateTime(value) {
  return new Date(value).toLocaleString('sv-SE');
}

function escapeYaml(value) {
  return String(value).replace(/"/g, '\\"');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function trimSlash(value) {
  return value.replace(/\/$/, '');
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Saknar miljövariabel ${name}`);
  return value;
}

function loadDotenv(filePath) {
  try {
    const data = fsSync.readFileSync(filePath, 'utf8');
    for (const line of data.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, raw] = match;
      if (process.env[key]) continue;
      process.env[key] = raw.replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // .env är frivillig; miljövariabler kan också sättas av schemaläggare.
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
