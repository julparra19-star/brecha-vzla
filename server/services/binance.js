// =============================================================================
// Servicio Binance P2P
// Obtiene precios de compra y venta de USDT/VES desde Binance P2P
// Calcula promedios de los 10 mejores oferentes (merchants verificados)
// =============================================================================

// URL del endpoint de búsqueda P2P de Binance
const BINANCE_P2P_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

// User-Agent realista para evitar bloqueos
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Construye el cuerpo de la solicitud para la API P2P de Binance
 * @param {'BUY'|'SELL'} tradeType - Tipo de operación
 * @returns {object} Cuerpo de la solicitud
 */
function buildRequestBody(tradeType) {
  return {
    asset: 'USDT',
    fiat: 'VES',
    tradeType: tradeType,
    page: 1,
    rows: 11, // Pedimos 11 para descartar el primero (outlier) y quedarnos con 10
    payTypes: [],
    merchantCheck: true, // Solo merchants verificados
  };
}

/**
 * Obtiene los precios P2P de Binance para un tipo de operación
 * @param {'BUY'|'SELL'} tradeType - Tipo de operación (compra o venta)
 * @returns {Promise<number[]>} Array de precios
 */
async function fetchP2PPrices(tradeType) {
  const body = buildRequestBody(tradeType);

  const response = await fetch(BINANCE_P2P_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Error HTTP Binance P2P (${tradeType}): ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Extraer precios de los anuncios
  if (!data || !data.data || !Array.isArray(data.data)) {
    throw new Error(`Respuesta inesperada de Binance P2P para ${tradeType}`);
  }

  // Cada anuncio tiene la estructura: { adv: { price: "XX.XX" }, ... }
  const prices = data.data.map((item) => parseFloat(item.adv.price));

  return prices.filter((p) => !isNaN(p) && p > 0);
}

/**
 * Calcula el promedio de un array de números
 * @param {number[]} prices - Array de precios
 * @returns {number} Promedio
 */
function calculateAverage(prices) {
  if (!prices || prices.length === 0) return 0;
  const sum = prices.reduce((acc, price) => acc + price, 0);
  return sum / prices.length;
}

/**
 * Obtiene precios de compra, venta y promedio de USDT/VES en Binance P2P
 * @returns {Promise<{compra: number|null, venta: number|null, promedio: number|null}>}
 */
async function fetchBinanceP2P() {
  try {
    // Obtener precios de compra y venta en paralelo
    const [buyPrices, sellPrices] = await Promise.all([
      fetchP2PPrices('BUY'),
      fetchP2PPrices('SELL'),
    ]);

    if (buyPrices.length === 0 && sellPrices.length === 0) {
      console.warn('[Binance] No se obtuvieron precios de compra ni venta');
      return { compra: null, venta: null, promedio: null };
    }

    // Descartamos el primer resultado: en COMPRA es el más caro (outlier alto)
    // y en VENTA es el más barato (outlier bajo), lo que distorsiona el promedio.
    // Usamos posiciones 2..11 (índice 1 en adelante).
    const buyFiltered  = buyPrices.slice(1);
    const sellFiltered = sellPrices.slice(1);

    const compra  = parseFloat(calculateAverage(buyFiltered  ).toFixed(3));
    const venta   = parseFloat(calculateAverage(sellFiltered ).toFixed(3));

    // Promedio general entre compra y venta
    const promedio = parseFloat(((compra + venta) / 2).toFixed(3));

    return { compra, venta, promedio };
  } catch (error) {
    console.error('[Binance] Error al obtener precios P2P:', error.message);
    return { compra: null, venta: null, promedio: null };
  }
}

module.exports = { fetchBinanceP2P };
