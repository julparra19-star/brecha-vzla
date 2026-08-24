/**
 * inject_historical_data.js
 * Inyecta datos históricos reales del BCV en Supabase desde 3 fuentes:
 * 1. CSV (tasas historica formato venezuela.csv) - Solo $BCV desde Aug 2023
 * 2. Excel (Libro1.xlsx) - $BCV + Euro + Binance desde Feb 2026 hasta Aug 5
 * 3. Conserva datos reales de Supabase desde Aug 9 en adelante
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const fs = require('fs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const TABLE = 'exchange_rates';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function deleteFakeData() {
  console.log('\n PASO 1: Borrando datos simulados anteriores al 9 de agosto 2026...');
  const cutoff = '2026-08-09T00:00:00.000Z';
  const { error, count } = await supabase.from(TABLE).delete({ count: 'exact' }).lt('created_at', cutoff);
  if (error) { console.error('Error borrando datos falsos:', error.message); return false; }
  console.log('Datos simulados eliminados. Registros borrados:', count ?? 'N/A');
  return true;
}

async function injectCSV() {
  console.log('\n PASO 2: Procesando CSV historico del BCV (2023 - ene 2026)...');
  const raw = fs.readFileSync('tasas historica formato venezuela.csv', 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim());
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r/g, '').replace(/"/g, '');
    const parts = line.split(';');
    if (parts.length < 2) continue;
    const [dayStr, rateStr] = parts;
    const [dd, mm, yyyy] = dayStr.split('-');
    if (!dd || !mm || !yyyy) continue;
    const dateObj = new Date(Date.UTC(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd)));
    if (dateObj >= new Date('2026-02-01T00:00:00Z')) continue;
    const rate = parseFloat(rateStr.replace(',', '.'));
    if (isNaN(rate) || rate <= 0) continue;
    records.push({
      created_at: dateObj.toISOString(),
      usd_bcv: rate,
      eur_bcv: null,
      usdt_compra: null,
      usdt_venta: null,
      usdt_promedio: null,
      brecha_usd_usdt: null,
      brecha_eur_usdt: null,
      spread_usdt: null,
    });
  }

  console.log('   Registros CSV a inyectar:', records.length);
  const CHUNK = 50;
  let inserted = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const { error } = await supabase.from(TABLE).insert(chunk);
    if (error) { console.error('Error en chunk CSV:', error.message); }
    else { inserted += chunk.length; process.stdout.write('   Progreso CSV: ' + inserted + '/' + records.length + '\r'); }
    await sleep(200);
  }
  console.log('\nCSV inyectado. Total:', inserted, 'registros.');
}

async function injectExcel() {
  console.log('\n PASO 3: Procesando Excel Libro1.xlsx (Feb 2026 - Aug 5 2026)...');
  const wb = XLSX.readFile('Libro1.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const records = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 4) continue;
    const excelDate = row[1];
    const usd_bcv = parseFloat(row[2]);
    const eur_bcv = parseFloat(row[3]);
    const usdt = parseFloat(row[4]);
    if (!excelDate || isNaN(usd_bcv)) continue;
    const jsDate = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
    const isoDate = new Date(Date.UTC(jsDate.getUTCFullYear(), jsDate.getUTCMonth(), jsDate.getUTCDate()));
    if (isoDate >= new Date('2026-08-09T00:00:00Z')) continue;
    const brecha = (!isNaN(usdt) && usd_bcv > 0) ? parseFloat(((usdt - usd_bcv) / usd_bcv * 100).toFixed(3)) : null;
    records.push({
      created_at: isoDate.toISOString(),
      usd_bcv: isNaN(usd_bcv) ? null : parseFloat(usd_bcv.toFixed(4)),
      eur_bcv: isNaN(eur_bcv) ? null : parseFloat(eur_bcv.toFixed(4)),
      usdt_compra: isNaN(usdt) ? null : parseFloat(usdt.toFixed(4)),
      usdt_venta: isNaN(usdt) ? null : parseFloat(usdt.toFixed(4)),
      usdt_promedio: isNaN(usdt) ? null : parseFloat(usdt.toFixed(4)),
      brecha_usd_usdt: brecha,
      brecha_eur_usdt: null,
      spread_usdt: 0,
    });
  }

  console.log('   Registros Excel a inyectar:', records.length);
  const CHUNK = 50;
  let inserted = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const { error } = await supabase.from(TABLE).insert(chunk);
    if (error) { console.error('Error en chunk Excel:', error.message); }
    else { inserted += chunk.length; process.stdout.write('   Progreso Excel: ' + inserted + '/' + records.length + '\r'); }
    await sleep(200);
  }
  console.log('\nExcel inyectado. Total:', inserted, 'registros.');
}

async function main() {
  console.log('Iniciando inyeccion de datos historicos...');
  await deleteFakeData();
  await injectCSV();
  await injectExcel();
  const { count } = await supabase.from(TABLE).select('*', { count: 'exact', head: true });
  console.log('\nTotal registros en la base de datos:', count);
  console.log('Inyeccion completada!');
}

main().catch(console.error);
