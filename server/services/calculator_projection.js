// =============================================================================
// calculator_projection.js — Motor de Proyección Financiera
// Analiza tendencias históricas y proyecta valores futuros
// para evaluar si conviene comprar USDT en Binance P2P
// =============================================================================

/**
 * Calcula la pendiente (tendencia diaria) de un conjunto de valores
 * usando regresión lineal simple (mínimos cuadrados)
 * @param {number[]} values - Array de valores en orden cronológico
 * @returns {number} Cambio promedio por período
 */
function calcularTendencia(values) {
  const n = values.length;
  if (n < 2) return 0;

  // Regresión lineal: y = a + b*x
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;

  let numerador = 0;
  let denominador = 0;

  for (let i = 0; i < n; i++) {
    numerador += (i - xMean) * (values[i] - yMean);
    denominador += (i - xMean) ** 2;
  }

  return denominador === 0 ? 0 : numerador / denominador;
}

/**
 * Agrupa registros históricos por día y calcula promedios diarios
 * @param {Array} historial - Registros de Supabase
 * @returns {Array} Un registro promedio por día, ordenado cronológicamente
 */
function agruparPorDia(historial) {
  const porDia = {};

  historial.forEach((r) => {
    const dia = new Date(r.created_at).toISOString().slice(0, 10);
    if (!porDia[dia]) {
      porDia[dia] = { dia, registros: [] };
    }
    porDia[dia].registros.push(r);
  });

  return Object.values(porDia)
    .sort((a, b) => a.dia.localeCompare(b.dia))
    .map(({ dia, registros }) => {
      const promedio = (campo) =>
        registros.reduce((s, r) => s + (r[campo] || 0), 0) / registros.length;

      return {
        dia,
        usd_bcv: promedio('usd_bcv'),
        eur_bcv: promedio('eur_bcv'),
        usdt_compra: promedio('usdt_compra'),
        usdt_venta: promedio('usdt_venta'),
        usdt_promedio: promedio('usdt_promedio'),
        brecha_usd_usdt: promedio('brecha_usd_usdt'),
      };
    });
}

/**
 * Motor principal: calcula la proyección financiera
 * @param {number} monto - Monto inicial en Bolívares
 * @param {number} dias - Días a proyectar
 * @param {Array} historial - Datos históricos de Supabase
 * @param {Object} tasasActuales - Tasas en tiempo real { bcv, binance, brechas }
 * @param {number|null} buyPriceManual - Precio manual al que el usuario compra USDT hoy
 * @param {number|null} sellPriceManual - Precio manual al que el usuario venderá USDT en el futuro
 * @returns {Object} Análisis completo con recomendación
 */
function calcularProyeccion(monto, dias, historial, tasasActuales, buyPriceManual = null, sellPriceManual = null) {
  const { bcv, binance } = tasasActuales;

  const usdBcvHoy = bcv?.usd || 0;
  const eurBcvHoy = bcv?.eur || 0;
  const usdtCompraHoy = binance?.compra || 0;
  const usdtVentaHoy = binance?.venta || 0;
  const usdtPromedioHoy = binance?.promedio || 0;

  // === TENDENCIAS HISTÓRICAS ===
  let tendencias = {
    usd_bcv: 0,
    usdt_compra: 0,
    usdt_venta: 0,
    confianza: 'baja',
    dias_analizados: 0,
  };

  const datosDiarios = agruparPorDia(historial);

  if (datosDiarios.length >= 2) {
    tendencias.usd_bcv = calcularTendencia(datosDiarios.map((d) => d.usd_bcv));
    tendencias.usdt_compra = calcularTendencia(datosDiarios.map((d) => d.usdt_compra));
    tendencias.usdt_venta = calcularTendencia(datosDiarios.map((d) => d.usdt_venta));
    tendencias.dias_analizados = datosDiarios.length;

    // Nivel de confianza según cantidad de días históricos
    if (datosDiarios.length >= 14) tendencias.confianza = 'alta';
    else if (datosDiarios.length >= 7) tendencias.confianza = 'media';
    else tendencias.confianza = 'baja';
  }

  // === PROYECCIONES DE MERCADO ===
  // Estas proyecciones representan el mercado real (Binance), sin importar el precio manual del usuario
  const usdBcvFuturo = Math.max(usdBcvHoy + tendencias.usd_bcv * dias, 1);
  const usdtCompraFuturo = Math.max(usdtCompraHoy + tendencias.usdt_compra * dias, 1);
  const usdtVentaFuturo = Math.max(usdtVentaHoy + tendencias.usdt_venta * dias, 1);

  // === PRECIOS EFECTIVOS PARA EL USUARIO ===
  // Si el usuario da un precio manual, lo usamos; si no, usamos el del mercado.
  // El usuario COMPRA USDT hoy usando el precio de VENTA del mercado.
  // El usuario VENDE USDT a futuro usando el precio de COMPRA del mercado.
  const precioUsuarioCompraHoy = buyPriceManual || usdtVentaHoy;
  const precioUsuarioVentaFuturo = sellPriceManual || usdtCompraFuturo;

  // === ESCENARIO A: Comprar USDT hoy y vender en X días ===
  const usdtComprados = monto / precioUsuarioCompraHoy;
  const bsRecuperadosBinance = usdtComprados * precioUsuarioVentaFuturo;
  const gananciaBinance = bsRecuperadosBinance - monto;
  const rentabilidadBinance = (gananciaBinance / monto) * 100;

  // Costo del spread (diferencia compra/venta al entrar y salir)
  // Spread real del mercado (informativo)
  const spreadActual = ((usdtVentaHoy - usdtCompraHoy) / usdtCompraHoy) * 100;
  const spreadFuturo = ((usdtVentaFuturo - usdtCompraFuturo) / usdtCompraFuturo) * 100;

  // === ESCENARIO B: Mantener en Bs. y comprar USDT al final ===
  // (referencia para comparar — ¿cuánto USDT comprarías en X días con el mismo monto?)
  const usdtFuturoConMismoMonto = monto / usdtVentaFuturo;
  const diferenciUSDT = usdtComprados - usdtFuturoConMismoMonto;

  // === ESCENARIO C: Convertir a USD al BCV y volver en X días ===
  const usdCompradosBCV = monto / usdBcvHoy;
  const bsRecuperadosBCV = usdCompradosBCV * usdBcvFuturo;
  const gananciaBCV = bsRecuperadosBCV - monto;
  const rentabilidadBCV = (gananciaBCV / monto) * 100;

  // === RECOMENDACIÓN ===
  // La operación es conveniente si la rentabilidad supera el costo del spread
  const umbralRentabilidad = 0.5; // 0.5% mínimo para que valga la pena
  const esBuenaDecision = rentabilidadBinance > umbralRentabilidad;
  const ventajaVsBCV = rentabilidadBinance - rentabilidadBCV;

  let recomendacion = '';
  let nivel = ''; // 'excelente', 'buena', 'neutral', 'mala'

  if (rentabilidadBinance > 3) {
    recomendacion = '¡Excelente momento para comprar USDT! La tendencia muestra una apreciación significativa.';
    nivel = 'excelente';
  } else if (rentabilidadBinance > umbralRentabilidad) {
    recomendacion = 'Parece una buena decisión. La proyección indica una ganancia moderada.';
    nivel = 'buena';
  } else if (rentabilidadBinance > -umbralRentabilidad) {
    recomendacion = 'Resultado neutro. El spread de Binance podría comerse la ganancia.';
    nivel = 'neutral';
  } else {
    recomendacion = 'No es un buen momento. La tendencia sugiere que el USDT podría bajar de precio.';
    nivel = 'mala';
  }

  return {
    entrada: { monto, dias },
    tasas_hoy: {
      usd_bcv: usdBcvHoy,
      usdt_compra: usdtCompraHoy, // El mercado P2P
      usdt_venta: usdtVentaHoy,   // El mercado P2P
      spread_actual_pct: parseFloat(spreadActual.toFixed(3)),
    },
    proyeccion: {
      usd_bcv_futuro: parseFloat(usdBcvFuturo.toFixed(3)),
      usdt_compra_futuro: parseFloat(usdtCompraFuturo.toFixed(3)), // Proyección del mercado
      usdt_venta_futuro: parseFloat(usdtVentaFuturo.toFixed(3)),   // Proyección del mercado
    },
    escenario_usdt: {
      usdt_comprados_hoy: parseFloat(usdtComprados.toFixed(6)),
      bs_recuperados: parseFloat(bsRecuperadosBinance.toFixed(2)),
      ganancia_bs: parseFloat(gananciaBinance.toFixed(2)),
      rentabilidad_pct: parseFloat(rentabilidadBinance.toFixed(3)),
      diferencia_usdt_vs_esperar: parseFloat(diferenciUSDT.toFixed(6)),
    },
    escenario_bcv: {
      bs_recuperados: parseFloat(bsRecuperadosBCV.toFixed(2)),
      ganancia_bs: parseFloat(gananciaBCV.toFixed(2)),
      rentabilidad_pct: parseFloat(rentabilidadBCV.toFixed(3)),
    },
    tendencias: {
      cambio_diario_usdt_compra: parseFloat(tendencias.usdt_compra.toFixed(3)),
      cambio_diario_usdt_venta: parseFloat(tendencias.usdt_venta.toFixed(3)),
      cambio_diario_usd_bcv: parseFloat(tendencias.usd_bcv.toFixed(3)),
      dias_analizados: tendencias.dias_analizados,
      confianza: tendencias.confianza,
    },
    recomendacion: {
      nivel,
      texto: recomendacion,
      es_buena_decision: esBuenaDecision,
      ventaja_vs_bcv_pct: parseFloat(ventajaVsBCV.toFixed(3)),
    },
  };
}

module.exports = { calcularProyeccion };
