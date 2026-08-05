// ============================================================
// api.js — Cliente API para BrechaVzla
// Todas las funciones de comunicación con el backend Express
// ============================================================

// Base URL dinámica según el origen actual
const API_BASE = window.location.origin;

// Estado de carga global
let _isLoading = false;

/**
 * Obtiene el estado actual de carga
 * @returns {boolean} true si hay una petición en curso
 */
export function isLoading() {
  return _isLoading;
}

/**
 * Realiza una petición GET genérica con manejo de errores
 * @param {string} endpoint - Ruta del endpoint (ej: '/api/rates')
 * @returns {Promise<Object|null>} Datos parseados o null en caso de error
 */
async function fetchEndpoint(endpoint) {
  _isLoading = true;

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // Tiempo límite de 15 segundos
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`[API] Error ${response.status} en ${endpoint}`);
      return null;
    }

    const data = await response.json();
    return data;

  } catch (error) {
    // Diferenciar errores de red vs timeout
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      console.error(`[API] Timeout al consultar ${endpoint}`);
    } else {
      console.error(`[API] Error de red en ${endpoint}:`, error.message);
    }
    return null;

  } finally {
    _isLoading = false;
  }
}

/**
 * Obtiene todas las tasas combinadas (BCV + Binance + Brechas)
 * Endpoint: GET /api/rates
 * @returns {Promise<Object|null>} { bcv, binance, brechas, timestamp }
 */
export async function fetchRates() {
  const response = await fetchEndpoint('/api/rates');
  // El backend envuelve en { success, data }, extraer el contenido
  return response?.data || response;
}

/**
 * Obtiene el historial de registros
 * Endpoint: GET /api/history
 * @returns {Promise<Array|null>} Array de registros históricos
 */
export async function fetchHistory(filter = 'last10') {
  const response = await fetchEndpoint(`/api/history?filter=${filter}`);
  return response?.data || response || [];
}

/**
 * Obtiene tasas BCV directamente
 * Endpoint: GET /api/bcv
 * @returns {Promise<Object|null>} { usd, eur, fecha }
 */
export async function fetchBCV() {
  return await fetchEndpoint('/api/bcv');
}

/**
 * Obtiene datos de Binance P2P directamente
 * Endpoint: GET /api/binance/p2p
 * @returns {Promise<Object|null>} { compra, venta, promedio }
 */
export async function fetchBinanceP2P() {
  return await fetchEndpoint('/api/binance/p2p');
}
