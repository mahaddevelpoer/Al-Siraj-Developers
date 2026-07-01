import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = process.cwd();

function read(root, rel) {
  const filePath = path.join(root, rel);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

function rel(root, file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function add(issues, severity, area, message, file = '') {
  issues.push({ severity, area, message, file });
}

function mustContain(issues, root, file, patterns, area) {
  const text = read(root, file);
  if (!text) {
    add(issues, 'error', area, 'Required file is missing', file);
    return;
  }
  for (const pattern of patterns) {
    const ok = pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern);
    if (!ok) add(issues, 'error', area, `Missing required handover guard: ${pattern.toString()}`, file);
  }
}

export async function runHandoverStabilityAudit(options = {}) {
  const root = options.rootPath || defaultRoot;
  const issues = [];

const rendererFiles = walk(path.join(root, 'src', 'renderer'))
  .filter((file) => /\.(jsx?|tsx?)$/.test(file));
const mainFiles = walk(path.join(root, 'src', 'main'))
  .filter((file) => /\.(jsx?|tsx?)$/.test(file));

const directAppealWrite = /\.from\(['"]appeals['"]\)[\s\S]{0,700}?\.(insert|upsert|update|delete)\s*\(/;
for (const file of rendererFiles) {
  const text = fs.readFileSync(file, 'utf8');
  if (directAppealWrite.test(text)) {
    add(issues, 'error', 'appeal_rls', 'Renderer must not directly write appeals; use appeal RPC helpers.', rel(root, file));
  }
}
for (const file of mainFiles) {
  const text = fs.readFileSync(file, 'utf8');
  if (directAppealWrite.test(text)) {
    add(issues, 'error', 'appeal_rls', 'Main process must not directly write appeals with anon client; use authenticated renderer RPC helpers.', rel(root, file));
  }
}

const preloadText = read(root, 'src/main/preload.js');
for (const legacyName of ['submitSalaryIncreaseAppeal', 'submitDeleteEmployeeAppeal']) {
  if (preloadText.includes(legacyName)) {
    add(issues, 'error', 'legacy_appeal_bridge_absence', `Legacy direct appeal bridge must not be exposed: ${legacyName}`, 'src/main/preload.js');
  }
}

mustContain(issues, root, 'src/renderer/lib/appeals.js', [
  'createBusinessAppeal',
  'setBusinessAppealOtp',
  'verifyBusinessAppealOtp',
  'create_business_appeal',
  'set_business_appeal_otp',
  'verify_business_appeal_otp',
], 'appeal_helpers');

mustContain(issues, root, 'src/sql/appeals-accountant-rls-fix.sql', [
  'CREATE OR REPLACE FUNCTION public.create_business_appeal',
  'CREATE OR REPLACE FUNCTION public.set_business_appeal_otp',
  'CREATE OR REPLACE FUNCTION public.verify_business_appeal_otp',
  "LOWER(BTRIM(COALESCE(u.town_name, ''))) = LOWER(BTRIM(COALESCE(p_town_name, '')))",
  "NOTIFY pgrst, 'reload schema'",
], 'appeal_sql');

mustContain(issues, root, 'src/sql/ceo-review-schema-repair.sql', [
  'CREATE OR REPLACE FUNCTION public.create_business_appeal',
  'CREATE OR REPLACE FUNCTION public.set_business_appeal_otp',
  'CREATE OR REPLACE FUNCTION public.verify_business_appeal_otp',
  'CREATE OR REPLACE FUNCTION public.ceo_review_appeal',
  "LOWER(BTRIM(COALESCE(u.town_name, ''))) = LOWER(BTRIM(COALESCE(p_town_name, '')))",
], 'ceo_review_sql');

mustContain(issues, root, 'src/main/db/online/index.js', [
  'function getCloudClient',
  'getInstallmentProperties',
  'getPropertyInstallments',
  'monthly_amount',
], 'online_installments');

mustContain(issues, root, 'src/renderer/systems/DailySystem/DailyIncomeEntry.jsx', [
  'installmentPaymentPayload',
  'collectionPayload',
  'SCHEDULE MISSING',
  'Date not set',
], 'daily_income_safety');

mustContain(issues, root, 'src/main/db/dataLayer.js', [
  'this._preferDbReads = false',
  'return await localFn();',
], 'single_source_of_truth');

const knownCrashNeedles = [
  'refreshKey is not defined',
  'getGlobalsPath is not defined',
  "Cannot access 'fe' before initialization",
];
for (const file of walk(path.join(root, 'src'))) {
  if (!/\.(jsx?|tsx?|mjs|cjs|sql)$/.test(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of knownCrashNeedles) {
    if (text.includes(needle)) {
      add(issues, 'error', 'known_crash_string', `Known crash string found: ${needle}`, rel(root, file));
    }
  }
}

const distElectronDir = path.join(root, 'dist_electron');
const installerPath = path.join(distElectronDir, 'AL-SIRAJ-DEVELOPERS-Setup-1.0.1.exe');
if ((options.checkInstaller || fs.existsSync(distElectronDir)) && !fs.existsSync(installerPath)) {
  add(issues, 'warning', 'installer', 'Installer has not been built yet.', 'dist_electron/AL-SIRAJ-DEVELOPERS-Setup-1.0.1.exe');
}

const report = {
  generatedAt: new Date().toISOString(),
  issueCount: issues.length,
  issues,
};

const outDir = options.outputDir || path.join(root, 'Reports');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `handover-stability-audit-${new Date().toISOString().slice(0, 10)}.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

return { success: true, outPath, issueCount: issues.length, hasErrors: issues.some((issue) => issue.severity === 'error') };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runHandoverStabilityAudit().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (result.hasErrors) process.exitCode = 2;
  }).catch((error) => {
    console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
