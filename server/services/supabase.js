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
  // Si Supabase no está configurado, loguear advertencia y retornar null
  if (!isConfigured() || !supabase) {
    console.warn('[Supabase] ⚠️  Guardado omitido: Supabase no configurado');
    return null;
  }

  try {
    // Preparar el registro para insertar
    const record = {
      usd_bcv: data.bcv?.usd || null,
      eur_bcv: data.bcv?.eur || null,
      usdt_compra: data.binance?.compra || null,
      usdt_venta: data.binance?.venta || null,
      usdt_promedio: data.binance?.promedio || null,
      brecha_usd_usdt: data.brechas?.brecha_usd_usdt || null,
      brecha_eur_usdt: data.brechas?.brecha_eur_usdt || null,
      spread_usdt: data.brechas?.spread_usdt || null,
    };

    const { data: inserted, error } = await supabase
      .from(TABLE_NAME)
      .insert([record])
      .select();

    if (error) {
      throw error;
    }

    console.log('[Supabase] ✅ Tasas guardadas exitosamente');
    return inserted;
  } catch (error) {
    console.error('[Supabase] ❌ Error al guardar tasas:', error.message);
    return null;
  }
}

/**
 * Obtiene el historial de tasas de cambio
 * @param {number} limit - Cantidad máxima de registros a obtener (por defecto 50)
 * @returns {Promise<object[]>} Array de registros históricos ordenados por fecha descendente
 */
async function getHistory(limit = 50) {
  // Si Supabase no está configurado, retornar array vacío
  if (!isConfigured() || !supabase) {
    console.warn('[Supabase] ⚠️  Consulta omitida: Supabase no configurado');
    return [];
  }

  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

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
