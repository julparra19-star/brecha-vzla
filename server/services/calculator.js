// =============================================================================
// Servicio de Cálculo de Brechas
// Calcula las diferencias porcentuales entre tasas oficiales (BCV) y
// precios de mercado (Binance P2P), así como el spread de USDT
// =============================================================================

/**
 * Calcula las brechas entre las tasas del BCV y los precios de Binance P2P
 *
 * Fórmulas:
 * - Brecha USD/USDT = ((usdt_promedio - usd_bcv) / usd_bcv) * 100
 * - Brecha EUR/USDT = ((usdt_promedio - eur_bcv) / eur_bcv) * 100
 * - Spread USDT     = ((usdt_venta - usdt_compra) / usdt_compra) * 100
 *
 * @param {object} bcvData - Datos del BCV { usd, eur, fecha }
 * @param {object} binanceData - Datos de Binance P2P { compra, venta, promedio }
 * @returns {object} Objeto completo con todas las tasas y brechas calculadas
 */
function calculateGaps(bcvData, binanceData) {
  // Validar que tenemos datos suficientes para calcular
  if (!bcvData || !binanceData) {
    console.warn('[Calculadora] Datos insuficientes para calcular brechas');
    return {
      bcv: bcvData || { usd: null, eur: null, fecha: null },
      binance: binanceData || { compra: null, venta: null, promedio: null },
      brechas: {
        brecha_usd_usdt: null,
        brecha_eur_usdt: null,
        spread_usdt: null,
      },
      timestamp: new Date().toISOString(),
    };
  }

  const { usd: usd_bcv, eur: eur_bcv } = bcvData;
  const { compra: usdt_compra, venta: usdt_venta, promedio: usdt_promedio } = binanceData;

  // Calcular brecha USD/USDT
  // Indica cuánto más caro es el USDT en el mercado P2P vs la tasa oficial USD
  let brecha_usd_usdt = null;
  if (usd_bcv && usdt_promedio && usd_bcv > 0) {
    brecha_usd_usdt = parseFloat(
      (((usdt_promedio - usd_bcv) / usd_bcv) * 100).toFixed(3)
    );
  }

  // Calcular brecha EUR/USDT
  // Indica cuánto más caro es el USDT vs la tasa oficial EUR
  let brecha_eur_usdt = null;
  if (eur_bcv && usdt_promedio && eur_bcv > 0) {
    brecha_eur_usdt = parseFloat(
      (((usdt_promedio - eur_bcv) / eur_bcv) * 100).toFixed(3)
    );
  }

  // Calcular spread del USDT
  // Diferencia porcentual entre precio de venta y compra
  let spread_usdt = null;
  if (usdt_compra && usdt_venta && usdt_compra > 0) {
    spread_usdt = parseFloat(
      (((usdt_venta - usdt_compra) / usdt_compra) * 100).toFixed(3)
    );
  }

  return {
    bcv: {
      usd: usd_bcv,
      eur: eur_bcv,
      fecha: bcvData.fecha,
    },
    binance: {
      compra: usdt_compra,
      venta: usdt_venta,
      promedio: usdt_promedio,
    },
    brechas: {
      brecha_usd_usdt,
      brecha_eur_usdt,
      spread_usdt,
    },
    timestamp: new Date().toISOString(),
  };
}

module.exports = { calculateGaps };
