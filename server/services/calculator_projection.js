// =============================================================================
// calculator_projection.js — Motor de Proyección Financiera
// Analiza tendencias históricas y proyecta valores futuros
// para evaluar si conviene comprar USDT en Binance P2P
//
// MODELOS DE COMPORTAMIENTO:
//   BCV:    Solo cambia en días hábiles (L-V, sin feriados venezolanos).
//           La proyección ajusta el cambio al # de días hábiles reales.
//   Binance:Varía todos los días, incluyendo fines de semana.
//           Puede ser afectado por eventos externos (terremotos, crisis).
//           El modelo detecta días de "choque" como outliers estadísticos.
// =============================================================================

// Feriados fijos de Venezuela (MM-DD, se repiten cada año)
const FERIADOS_FIJOS_VE = [
  '01-01', // Año Nuevo
  '01-06', // Reyes Magos
  '03-19', // San José (movible en la práctica, aquí fijo)
  '04-19', // Declaración de Independencia
  '05-01', // Día del Trabajador
  '06-24', // Batalla de Carabobo
  '07-05', // Día de la Independencia
  '07-24', // Natalicio de Bolívar
  '10-12', // Día de la Resistencia Indígena
  '12-24', // Nochebuena (medio día hábil en práctica)
  '12-25', // Navidad
  '12-31', // Fin de año
];

/**
 * Determina si una fecha es un día hábil venezolano
 * (lunes a viernes, fuera de feriados fijos)
 * @param {Date} fecha
 * @returns {boolean}
 */
function esDiaHabil(fecha) {
  const dia = fecha.getDay(); // 0=Dom, 6=Sab
  if (dia === 0 || dia === 6) return false; // Finde

  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  const key = `${mm}-${dd}`;

  return !FERIADOS_FIJOS_VE.includes(key);
}

/**
 * Cuenta cuántos días hábiles venezolanos hay en los próximos N días
 * (desde hoy + 1 hasta hoy + N inclusive)
 * @param {number} diasCalendario - Días de calendario a proyectar
 * @returns {number} Días hábiles reales en ese período
 */
function contarDiasHabiles(diasCalendario) {
  const hoy = new Date();
  let hábiles = 0;
  for (let i = 1; i <= diasCalendario; i++) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() + i);
    if (esDiaHabil(d)) hábiles++;
  }
  return hábiles;
}

/**
 * Calcula la pendiente (tendencia diaria) de un conjunto de valores
 * usando regresión lineal simple (mínimos cuadrados)
 * @param {number[]} values - Array de valores en orden cronológico
 * @returns {number} Cambio promedio por período
 */
function calcularTendencia(values) {
  const n = values.length;
  if (n < 2) return 0;

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
 * Detecta días de "choque externo" en Binance usando desviación estándar.
 * Un día es outlier si su variación diaria supera 2σ de la media.
 * @param {Array} datosDiarios - Datos agrupados por día
 * @returns {{ volatilidad: string, diasChoque: number, sigma: number, nota: string }}
 */
function detectarVolatilidadBinance(datosDiarios) {
  if (datosDiarios.length < 3) {
    return { volatilidad: 'desconocida', diasChoque: 0, sigma: 0, nota: 'Datos insuficientes.' };
  }

  // Calcular cambios diarios absolutos
  const cambios = [];
  for (let i = 1; i < datosDiarios.length; i++) {
    const prev = datosDiarios[i - 1].usdt_compra;
    const curr = datosDiarios[i].usdt_compra;
    if (prev > 0) cambios.push(Math.abs(curr - prev));
  }

  const media = cambios.reduce((a, b) => a + b, 0) / cambios.length;
  const varianza = cambios.reduce((s, v) => s + (v - media) ** 2, 0) / cambios.length;
  const sigma = Math.sqrt(varianza);

  // Días con cambio > 2σ = "choque externo"
  const umbral = media + 2 * sigma;
  const diasChoque = cambios.filter((c) => c > umbral).length;
  const pctChoque = (diasChoque / cambios.length) * 100;

  let volatilidad;
  let nota;

  if (sigma < 2) {
    volatilidad = 'baja';
    nota = `Mercado estable. Cambio diario promedio: ±${media.toFixed(1)} Bs.`;
  } else if (sigma < 6) {
    volatilidad = 'media';
    nota = `Volatilidad moderada. Cambio diario promedio: ±${media.toFixed(1)} Bs. (σ=${sigma.toFixed(1)}).`;
  } else {
    volatilidad = 'alta';
    nota = `Alta volatilidad. Cambio diario promedio: ±${media.toFixed(1)} Bs. (σ=${sigma.toFixed(1)}). Posibles eventos externos.`;
  }

  if (diasChoque > 0) {
    nota += ` Se detectaron ${diasChoque} días de choque externo (>${(umbral).toFixed(1)} Bs. de variación) — equivalen al ${pctChoque.toFixed(0)}% de los días.`;
  }

  return { volatilidad, diasChoque, sigma: parseFloat(sigma.toFixed(2)), nota };
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
        esDiaHabil: esDiaHabil(new Date(dia + 'T12:00:00')),
      };
    });
}

/**
 * BACKTESTING: Mide qué tan bien predice el modelo comparando proyecciones
 * pasadas con la realidad.
 */
function backtestProyeccion(datosDiarios, diasProyeccion) {
  const erroresBCV = [];
  const erroresUSDT = [];
  const diasBCVSinCambio = [];

  const minDiasNecesarios = diasProyeccion + 5;
  if (datosDiarios.length < minDiasNecesarios) return null;

  const ventanaMinima = 7;

  for (let i = ventanaMinima; i < datosDiarios.length - diasProyeccion; i++) {
    const datosHasta = datosDiarios.slice(0, i);

    // BCV: tendencia sobre días hábiles solamente
    const datosHabileBCV = datosHasta.filter((d) => d.esDiaHabil);
    const tendBCV  = calcularTendencia(datosHabileBCV.map((d) => d.usd_bcv));
    const tendUSDT = calcularTendencia(datosHasta.map((d) => d.usdt_compra));

    const valorBCVHoy  = datosHasta[datosHasta.length - 1].usd_bcv;
    const valorUSDTHoy = datosHasta[datosHasta.length - 1].usdt_compra;

    // Calcular días hábiles en la ventana de proyección (desde el día i)
    let habilesEnVentana = 0;
    for (let j = 1; j <= diasProyeccion; j++) {
      const d = new Date(datosHasta[datosHasta.length - 1].dia + 'T12:00:00');
      d.setDate(d.getDate() + j);
      if (esDiaHabil(d)) habilesEnVentana++;
    }

    const proyBCV  = valorBCVHoy + tendBCV * habilesEnVentana;
    const proyUSDT = valorUSDTHoy + tendUSDT * diasProyeccion;

    const realBCV  = datosDiarios[i + diasProyeccion].usd_bcv;
    const realUSDT = datosDiarios[i + diasProyeccion].usdt_compra;

    if (realBCV > 0)  erroresBCV.push(Math.abs((proyBCV  - realBCV)  / realBCV)  * 100);
    if (realUSDT > 0) erroresUSDT.push(Math.abs((proyUSDT - realUSDT) / realUSDT) * 100);

    const bcvAnterior = datosHasta[datosHasta.length - 2]?.usd_bcv || valorBCVHoy;
    diasBCVSinCambio.push(Math.abs(realBCV - bcvAnterior) < 0.01 ? 1 : 0);
  }

  if (erroresBCV.length === 0 || erroresUSDT.length === 0) return null;

  const mapeBCV  = erroresBCV.reduce((a, b) => a + b, 0)  / erroresBCV.length;
  const mapeUSDT = erroresUSDT.reduce((a, b) => a + b, 0) / erroresUSDT.length;

  const precisionBCV  = Math.max(0, 100 - mapeBCV);
  const precisionUSDT = Math.max(0, 100 - mapeUSDT);

  const pctDiasBCVEstable = (diasBCVSinCambio.filter(Boolean).length / diasBCVSinCambio.length) * 100;

  return {
    dias_proyectados: diasProyeccion,
    muestras_analizadas: erroresBCV.length,
    bcv: {
      error_promedio_pct: parseFloat(mapeBCV.toFixed(2)),
      precision_pct: parseFloat(precisionBCV.toFixed(1)),
      dias_sin_cambio_pct: parseFloat(pctDiasBCVEstable.toFixed(1)),
      nota: `El BCV solo actualiza en días hábiles (L-V sin feriados). No cambia el ${pctDiasBCVEstable.toFixed(0)}% de los días — sube por escalones, no gradualmente.`,
    },
    usdt: {
      error_promedio_pct: parseFloat(mapeUSDT.toFixed(2)),
      precision_pct: parseFloat(precisionUSDT.toFixed(1)),
      nota: mapeUSDT < 3
        ? 'Binance varía diariamente. La tendencia es confiable en períodos estables.'
        : 'Alta variabilidad en Binance. Eventos externos (crisis, terremotos, noticias) pueden romper la tendencia.',
    },
    interpretacion: `En ${erroresBCV.length} ventanas de ${diasProyeccion} días analizadas: BCV con error ${mapeBCV.toFixed(1)}% · Binance con error ${mapeUSDT.toFixed(1)}%.`,
  };
}

/**
 * Motor principal: calcula la proyección financiera
 */
function calcularProyeccion(monto, dias, historial, tasasActuales, buyPriceManual = null, sellPriceManual = null) {
  const { bcv, binance } = tasasActuales;

  const usdBcvHoy      = bcv?.usd || 0;
  const usdtCompraHoy  = binance?.compra || 0;
  const usdtVentaHoy   = binance?.venta || 0;

  // === TENDENCIAS HISTÓRICAS ===
  const datosDiarios = agruparPorDia(historial);

  let tendencias = {
    usd_bcv: 0,
    usdt_compra: 0,
    usdt_venta: 0,
    confianza: 'baja',
    dias_analizados: 0,
  };

  if (datosDiarios.length >= 2) {
    // BCV: calcular tendencia SOLO sobre días hábiles (L-V sin feriados)
    const diasHabilesBCV = datosDiarios.filter((d) => d.esDiaHabil);
    tendencias.usd_bcv = calcularTendencia(diasHabilesBCV.map((d) => d.usd_bcv));

    // Binance: varía todos los días (incluyendo fines de semana)
    tendencias.usdt_compra = calcularTendencia(datosDiarios.map((d) => d.usdt_compra));
    tendencias.usdt_venta  = calcularTendencia(datosDiarios.map((d) => d.usdt_venta));
    tendencias.dias_analizados = datosDiarios.length;

    if (datosDiarios.length >= 14) tendencias.confianza = 'alta';
    else if (datosDiarios.length >= 7) tendencias.confianza = 'media';
    else tendencias.confianza = 'baja';
  }

  // === PROYECCIONES ===
  // BCV: solo se mueve en días hábiles reales dentro del período pedido
  const diasHabilesEnPeriodo = contarDiasHabiles(dias);
  const usdBcvFuturo     = Math.max(usdBcvHoy + tendencias.usd_bcv * diasHabilesEnPeriodo, 1);

  // Binance: varía todos los días de calendario
  const usdtCompraFuturo = Math.max(usdtCompraHoy + tendencias.usdt_compra * dias, 1);
  const usdtVentaFuturo  = Math.max(usdtVentaHoy  + tendencias.usdt_venta  * dias, 1);

  // === VOLATILIDAD BINANCE (detección de choques externos) ===
  const volatilidad = detectarVolatilidadBinance(datosDiarios);

  // === PRECIOS EFECTIVOS PARA EL USUARIO ===
  const precioUsuarioCompraHoy     = buyPriceManual  || usdtVentaHoy;
  const precioUsuarioVentaFuturo   = sellPriceManual || usdtCompraFuturo;

  // === ESCENARIO A: Comprar USDT hoy y vender en X días ===
  const usdtComprados          = monto / precioUsuarioCompraHoy;
  const bsRecuperadosBinance   = usdtComprados * precioUsuarioVentaFuturo;
  const gananciaBinance        = bsRecuperadosBinance - monto;
  const rentabilidadBinance    = (gananciaBinance / monto) * 100;

  const spreadActual = ((usdtVentaHoy - usdtCompraHoy) / usdtCompraHoy) * 100;

  // === ESCENARIO B: Mantener en Bs. y comprar USDT al final ===
  const usdtFuturoConMismoMonto = monto / usdtVentaFuturo;
  const diferenciUSDT           = usdtComprados - usdtFuturoConMismoMonto;

  // === ESCENARIO C: Convertir a USD al BCV y volver en X días ===
  const usdCompradosBCV  = monto / usdBcvHoy;
  const bsRecuperadosBCV = usdCompradosBCV * usdBcvFuturo;
  const gananciaBCV      = bsRecuperadosBCV - monto;
  const rentabilidadBCV  = (gananciaBCV / monto) * 100;

  // === BACKTESTING ===
  const backtest = backtestProyeccion(datosDiarios, dias);

  // === RECOMENDACIÓN ===
  const umbralRentabilidad = 0.5;
  const esBuenaDecision    = rentabilidadBinance > umbralRentabilidad;
  const ventajaVsBCV       = rentabilidadBinance - rentabilidadBCV;

  let recomendacion = '';
  let nivel = '';

  // Si hay alta volatilidad, ser más conservador en la recomendación
  const ajusteVolatilidad = volatilidad.volatilidad === 'alta' ? 1.5 : 0;

  if (rentabilidadBinance > 3 + ajusteVolatilidad) {
    recomendacion = '¡Excelente momento para comprar USDT! La tendencia muestra una apreciación significativa.';
    nivel = 'excelente';
  } else if (rentabilidadBinance > umbralRentabilidad + ajusteVolatilidad) {
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
    calendario: {
      dias_calendario: dias,
      dias_habiles_bcv: diasHabilesEnPeriodo,
    },
    tasas_hoy: {
      usd_bcv: usdBcvHoy,
      usdt_compra: usdtCompraHoy,
      usdt_venta: usdtVentaHoy,
      spread_actual_pct: parseFloat(spreadActual.toFixed(3)),
    },
    proyeccion: {
      usd_bcv_futuro:      parseFloat(usdBcvFuturo.toFixed(3)),
      usdt_compra_futuro:  parseFloat(usdtCompraFuturo.toFixed(3)),
      usdt_venta_futuro:   parseFloat(usdtVentaFuturo.toFixed(3)),
    },
    escenario_usdt: {
      usdt_comprados_hoy:           parseFloat(usdtComprados.toFixed(6)),
      bs_recuperados:               parseFloat(bsRecuperadosBinance.toFixed(2)),
      ganancia_bs:                  parseFloat(gananciaBinance.toFixed(2)),
      rentabilidad_pct:             parseFloat(rentabilidadBinance.toFixed(3)),
      diferencia_usdt_vs_esperar:   parseFloat(diferenciUSDT.toFixed(6)),
    },
    escenario_bcv: {
      bs_recuperados:    parseFloat(bsRecuperadosBCV.toFixed(2)),
      ganancia_bs:       parseFloat(gananciaBCV.toFixed(2)),
      rentabilidad_pct:  parseFloat(rentabilidadBCV.toFixed(3)),
    },
    tendencias: {
      cambio_por_dia_habil_bcv:      parseFloat(tendencias.usd_bcv.toFixed(3)),
      cambio_diario_usdt_compra:     parseFloat(tendencias.usdt_compra.toFixed(3)),
      cambio_diario_usdt_venta:      parseFloat(tendencias.usdt_venta.toFixed(3)),
      dias_analizados:               tendencias.dias_analizados,
      confianza:                     tendencias.confianza,
    },
    volatilidad_binance: {
      nivel:       volatilidad.volatilidad,
      sigma_bs:    volatilidad.sigma,
      dias_choque: volatilidad.diasChoque,
      nota:        volatilidad.nota,
    },
    precision_modelo: backtest,
    recomendacion: {
      nivel,
      texto: recomendacion,
      es_buena_decision: esBuenaDecision,
      ventaja_vs_bcv_pct: parseFloat(ventajaVsBCV.toFixed(3)),
    },
  };
}

module.exports = { calcularProyeccion };
