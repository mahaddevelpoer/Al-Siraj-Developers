import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const buckets = (process.env.SUPABASE_CLEAR_BUCKETS || 'zameenkhata-files,zameen-khata,receipts,property-files,reports')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);

if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

async function listAll(bucket, prefix = '') {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) {
    if (/not found/i.test(error.message || '')) return [];
    if (/bucket/i.test(error.message || '') && /not/i.test(error.message || '')) return [];
    throw error;
  }
  const files = [];
  for (const item of data || []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id || item.metadata) files.push(path);
    else files.push(...await listAll(bucket, path));
  }
  return files;
}

for (const bucket of buckets) {
  const files = await listAll(bucket);
  for (let i = 0; i < files.length; i += 100) {
    const batch = files.slice(i, i + 100);
    if (!batch.length) continue;
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) throw error;
    console.log(`Deleted ${batch.length} object(s) from ${bucket}`);
  }
}

console.log('Cloud storage cleanup complete.');
