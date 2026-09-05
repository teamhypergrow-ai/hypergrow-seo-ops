import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';

const SUPABASE_URL = 'https://tstneqeqmxjalhpvoktl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_1UlOMiEXT9-ajMIjwGVRSw_qg4pXrri';
const COLLECTOR_VERSION = '1.0.0';
const GLOBAL_CONCURRENCY = 3;
const SETTLE_MS = 1800;
const MAX_VISIBLE_TEXT = 30000;

const normalizeText = (value = '') => value.replace(/\s+/g, ' ').trim();
const sha256 = (value = '') => createHash('sha256').update(value).digest('hex');

function jsonLdTypes(value, out = []) {
  if (Array.isArray(value)) {
    for (const child of value) jsonLdTypes(child, out);
    return out;
  }
  if (value && typeof value === 'object') {
    const t = value['@type'];
    if (typeof t === 'string') out.push(t);
    if (Array.isArray(t)) out.push(...t.filter(x => typeof x === 'string'));
    for (const child of Object.values(value)) jsonLdTypes(child, out);
  }
  return out;
}

async function fetchTargets() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/seo_rendered_crawl_targets_public_v1`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'apikey': SUPABASE_PUBLISHABLE_KEY
    },
    body: JSON.stringify({ p_limit: 50 })
  });
  if (!response.ok) throw new Error(`target feed failed ${response.status}: ${await response.text()}`);
  const targets = await response.json();
  if (!Array.isArray(targets) || targets.length === 0) throw new Error('target feed returned no rows');
  return targets;
}

async function crawlOne(browser, target) {
  const startedAt = new Date();
  const start = Date.now();
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'HyperGrowRenderedCrawler/1.0 (+read-only SEO diagnostics)'
  });
  const page = await context.newPage();
  const base = {
    project_slug: target.project_slug,
    url: target.target_url,
    collector: 'github_actions_playwright',
    collector_version: COLLECTOR_VERSION
  };
  try {
    const response = await page.goto(target.target_url, {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });
    await page.waitForTimeout(SETTLE_MS);
    const headers = response ? await response.allHeaders() : {};
    const extracted = await page.evaluate(() => {
      const one = (s) => document.querySelector(s);
      const all = (s) => Array.from(document.querySelectorAll(s));
      const absolute = (href) => {
        try { return new URL(href, location.href).href; } catch { return null; }
      };
      const thisHost = location.hostname.replace(/^www\./, '').toLowerCase();
      const internal = [];
      const external = [];
      for (const anchor of all('a[href]')) {
        const href = absolute(anchor.getAttribute('href'));
        if (!href) continue;
        try {
          const host = new URL(href).hostname.replace(/^www\./, '').toLowerCase();
          (host === thisHost ? internal : external).push(href);
        } catch {}
      }
      return {
        title: document.title || null,
        meta_description: one('meta[name="description"]')?.content || null,
        canonical_url: one('link[rel="canonical"]')?.href || null,
        robots_meta: one('meta[name="robots"]')?.content || null,
        h1: all('h1').map(x => (x.innerText || x.textContent || '').trim()).filter(Boolean),
        h2: all('h2').map(x => (x.innerText || x.textContent || '').trim()).filter(Boolean),
        internal_links: [...new Set(internal)],
        external_links: [...new Set(external)],
        visible_text: document.body?.innerText || '',
        dom: document.documentElement?.outerHTML || '',
        jsonld: all('script[type="application/ld+json"]').map(x => x.textContent || ''),
        hreflang: all('link[rel="alternate"][hreflang]').map(x => ({
          hreflang: x.getAttribute('hreflang'),
          href: absolute(x.getAttribute('href'))
        }))
      };
    });

    const entities = [];
    const schemaErrors = [];
    extracted.jsonld.forEach((raw, index) => {
      try { jsonLdTypes(JSON.parse(raw), entities); }
      catch (error) { schemaErrors.push({ index, error: String(error).slice(0, 500) }); }
    });
    const visibleText = normalizeText(extracted.visible_text);
    const normalizedDom = normalizeText(extracted.dom);
    const completedAt = new Date();

    return {
      ...base,
      final_url: page.url(),
      http_status: response?.status() ?? null,
      response_ms: Date.now() - start,
      title: extracted.title,
      meta_description: extracted.meta_description,
      canonical_url: extracted.canonical_url,
      robots_meta: extracted.robots_meta,
      h1: extracted.h1,
      h2: extracted.h2,
      internal_links: extracted.internal_links,
      external_links: extracted.external_links,
      jsonld_count: extracted.jsonld.length,
      word_count: visibleText ? visibleText.split(/\s+/).length : 0,
      visible_text: visibleText.slice(0, MAX_VISIBLE_TEXT),
      rendered_dom_hash: sha256(normalizedDom),
      rendered_visible_text_hash: sha256(visibleText),
      x_robots_tag: headers['x-robots-tag'] || null,
      structured_data_entities: [...new Set(entities)].sort(),
      structured_data_errors: schemaErrors,
      hreflang_state: extracted.hreflang,
      core_web_vitals: null,
      error: null,
      collector_provenance: {
        runtime: `node-${process.version}`,
        browser_name: 'chromium',
        browser_version: browser.version(),
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        navigation_wait_strategy: `domcontentloaded+${SETTLE_MS}ms_settle`,
        collector_host_instance: os.hostname(),
        github_repository: process.env.GITHUB_REPOSITORY || 'teamhypergrow-ai/hypergrow-seo-ops',
        github_run_id: process.env.GITHUB_RUN_ID || null,
        github_sha: process.env.GITHUB_SHA || null,
        read_only: true,
        javascript_executed: true
      },
      metadata: {
        evidence_contract: 'rendered_browser_v1',
        source: 'github_actions_playwright',
        target_owner_quality: target.owner_quality || null,
        target_tier_a_queries: target.tier_a_queries ?? null,
        target_commercial_value: target.commercial_value ?? null
      }
    };
  } catch (error) {
    return {
      ...base,
      final_url: page.url() || target.target_url,
      http_status: null,
      response_ms: Date.now() - start,
      title: null,
      meta_description: null,
      canonical_url: null,
      robots_meta: null,
      h1: [], h2: [], internal_links: [], external_links: [],
      jsonld_count: 0, word_count: 0, visible_text: '',
      rendered_dom_hash: null,
      rendered_visible_text_hash: null,
      x_robots_tag: null,
      structured_data_entities: [],
      structured_data_errors: [],
      hreflang_state: [],
      core_web_vitals: null,
      error: `${error?.name || 'Error'}: ${error?.message || String(error)}`,
      collector_provenance: {
        runtime: `node-${process.version}`,
        browser_name: 'chromium',
        browser_version: browser.version(),
        started_at: startedAt.toISOString(),
        completed_at: new Date().toISOString(),
        navigation_wait_strategy: `domcontentloaded+${SETTLE_MS}ms_settle`,
        collector_host_instance: os.hostname(),
        github_repository: process.env.GITHUB_REPOSITORY || 'teamhypergrow-ai/hypergrow-seo-ops',
        github_run_id: process.env.GITHUB_RUN_ID || null,
        github_sha: process.env.GITHUB_SHA || null,
        read_only: true,
        javascript_executed: true
      },
      metadata: { evidence_contract: 'rendered_browser_v1', source: 'github_actions_playwright' }
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const targets = await fetchTargets();
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const queues = new Map();
  for (const target of targets) {
    const key = target.project_slug;
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key).push(target);
  }
  const projects = [...queues.keys()];
  let active = 0;
  let projectIndex = 0;

  await new Promise((resolve, reject) => {
    const launch = () => {
      if (results.length === targets.length && active === 0) return resolve();
      while (active < GLOBAL_CONCURRENCY) {
        let picked = null;
        for (let i = 0; i < projects.length; i++) {
          const idx = (projectIndex + i) % projects.length;
          const project = projects[idx];
          const queue = queues.get(project);
          if (queue?.length) {
            picked = queue.shift();
            projectIndex = (idx + 1) % projects.length;
            break;
          }
        }
        if (!picked) break;
        active++;
        crawlOne(browser, picked).then(row => {
          results.push(row);
          console.log(`${row.project_slug} ${row.http_status ?? 'ERR'} ${row.url} ${row.error ? row.error.slice(0,120) : 'OK'}`);
        }).catch(reject).finally(() => { active--; launch(); });
      }
    };
    launch();
  });

  await browser.close();
  await mkdir(new URL('./out/', import.meta.url), { recursive: true });
  const generatedAt = new Date().toISOString();
  const byProject = {};
  for (const row of results) (byProject[row.project_slug] ||= []).push(row);
  const manifest = {
    contract_version: '1.0',
    generated_at: generatedAt,
    source_repository: process.env.GITHUB_REPOSITORY || 'teamhypergrow-ai/hypergrow-seo-ops',
    github_run_id: process.env.GITHUB_RUN_ID || null,
    github_sha: process.env.GITHUB_SHA || null,
    collector: 'github_actions_playwright',
    collector_version: COLLECTOR_VERSION,
    targets: targets.length,
    successful: results.filter(x => !x.error).length,
    failed: results.filter(x => x.error).length,
    projects: {}
  };
  for (const [project, rows] of Object.entries(byProject)) {
    rows.sort((a,b) => a.url.localeCompare(b.url));
    const payload = {
      contract_version: '1.0',
      generated_at: generatedAt,
      source_repository: manifest.source_repository,
      github_run_id: manifest.github_run_id,
      github_sha: manifest.github_sha,
      project_slug: project,
      rows
    };
    await writeFile(new URL(`./out/${project}.json`, import.meta.url), JSON.stringify(payload));
    manifest.projects[project] = { rows: rows.length, successful: rows.filter(x => !x.error).length, failed: rows.filter(x => x.error).length };
  }
  await writeFile(new URL('./out/manifest.json', import.meta.url), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
