// =============================================================================
// Servicio Supabase
// Gestiona la persistencia de datos históricos de tasas de cambio
// Si las credenciales no están configuradas, usa funciones mock con advertencias
// =============================================================================

const { createClient } = require('@supabase/supabase-js');

// Leer credenciales de variables de entorno
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Nombre de la tabla en Supabase
const TABLE_NAME = 'exchange_rates';

/**
 * Verifica si Supabase está configurado correctamente
 * @returns {boolean} true si las variables de entorno están presentes
 */
function isConfigured() {
  return !!(SUPABASE_URL && SUPABASE_KEY);
}

// Crear cliente de Supabase solo si está configurado
let supabase = null;
if (isConfigured()) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('[Supabase] ✅ Cliente inicializado correctamente');
} else {
  console.warn('[Supabase] ⚠️  Variables SUPABASE_URL y/o SUPABASE_KEY no configuradas');
  console.warn('[Supabase] ⚠️  La app funcionará sin persistencia de datos');
}

/**
 * Guarda las tasas de cambio en Supabase
 * @param {object} data - Datos a guardar con las tasas y brechas calculadas
 * @returns {Promise<object|null>} Datos insertados o null si hay error
 */
async function saveRates(data) {
  if (!isConfigured() || !supabase) {
    console.warn('[Supabase] ⚠️  Guardado omitido: Supabase no configurado');
    return null;
  }

  try {
    const record = {
      usd_bcv:         data.bcv?.usd || null,
      eur_bcv:         data.bcv?.eur || null,
      usdt_compra:     data.binance?.compra || null,
      usdt_venta:      data.binance?.venta || null,
      usdt_promedio:   data.binance?.promedio || null,
      brecha_usd_usdt: data.brechas?.brecha_usd_usdt || null,
      brecha_eur_usdt: data.brechas?.brecha_eur_usdt || null,
      spread_usdt:     data.brechas?.spread_usdt || null,
    };

    const { data: inserted, error } = await supabase
      .from(TABLE_NAME)
      .insert([record])
      .select();

    if (error) throw error;

    console.log('[Supabase] ✅ Tasas guardadas exitosamente');
    return inserted;
  } catch (error) {
    console.error('[Supabase] ❌ Error al guardar tasas:', error.message);
    return null;
  }
}

/**
 * Obtiene el historial de tasas de cambio con filtro de tiempo
 * @param {number} limit - Máximo de registros (default 500)
 * @param {string} filter - 'last10' | 'today' | 'week' | 'month' (default 'last10')
 * @returns {Promise<object[]>} Registros históricos ordenados por fecha descendente
 */
async function getHistory(limit = 500, filter = 'last10') {
  if (!isConfigured() || !supabase) {
    console.warn('[Supabase] ⚠️  Consulta omitida: Supabase no configurado');
    return [];
  }

  try {
    let query = supabase
      .from(TABLE_NAME)
      .select('*')
      .order('created_at', { ascending: false });

    const now = new Date();

    if (filter === 'today') {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      query = query.gte('created_at', startOfDay.toISOString()).limit(limit);
    } else if (filter === 'week') {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      query = query.gte('created_at', weekAgo.toISOString()).limit(limit);
    } else if (filter === 'month') {
      const monthAgo = new Date(now);
      monthAgo.setDate(monthAgo.getDate() - 30);
      query = query.gte('created_at', monthAgo.toISOString()).limit(limit);
    } else {
      // last10: los últimos 10 registros sin importar fecha
      query = query.limit(10);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[Supabase] ❌ Error al obtener historial:', error.message);
    return [];
  }
}

module.exports = {
  saveRates,
  getHistory,
  isConfigured,
};
