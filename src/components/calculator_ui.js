// ============================================================
// calculator_ui.js — Lógica de la Calculadora de Proyección
// Conecta el formulario con el endpoint /api/calculator
// ============================================================

const API_BASE = window.location.origin;

/**
 * Inicializa todos los eventos de la calculadora
 */
export function initCalculadora() {
  const btnCalcular = document.getElementById('btn-calcular');
  const inputAmount = document.getElementById('calc-amount');
  const inputDays   = document.getElementById('calc-days');
  const dayBtns     = document.querySelectorAll('.calc-day-btn');

  if (!btnCalcular) return;

  // Botones rápidos de días
  dayBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      dayBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      inputDays.value = btn.dataset.days;
    });
  });

  // Enter en los inputs dispara el cálculo
  [inputAmount, inputDays].forEach((inp) => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btnCalcular.click();
    });
  });

  // Botón principal
  btnCalcular.addEventListener('click', async () => {
    const monto = parseFloat(inputAmount.value);
    const dias  = parseInt(inputDays.value);
    const precioCompra = parseFloat(document.getElementById('calc-precio-compra')?.value) || null;
    const precioVenta  = parseFloat(document.getElementById('calc-precio-venta')?.value) || null;

    if (!monto || monto <= 0) {
      inputAmount.focus();
      inputAmount.style.borderColor = 'var(--accent-red)';
      setTimeout(() => { inputAmount.style.borderColor = ''; }, 1500);
      return;
    }

    if (!dias || dias < 1 || dias > 90) {
      inputDays.focus();
      return;
    }

    await ejecutarCalculo(monto, dias, precioCompra, precioVenta);
  });
}

/**
 * Llama al endpoint y renderiza los resultados
 * @param {number} monto
 * @param {number} dias
 * @param {number|null} precioCompraManual - Precio real de compra (override API)
 * @param {number|null} precioVentaManual  - Precio objetivo de venta (override proyectado)
 */
async function ejecutarCalculo(monto, dias, precioCompraManual = null, precioVentaManual = null) {
  const loading     = document.getElementById('calc-loading');
  const resultados  = document.getElementById('calc-resultados');
  const btnCalcular = document.getElementById('btn-calcular');

  // Mostrar loading
  resultados.classList.add('hidden');
  loading.classList.remove('hidden');
  btnCalcular.disabled = true;
  btnCalcular.textContent = 'Calculando…';

  try {
    let url = `${API_BASE}/api/calculator?amount=${monto}&days=${dias}`;
    if (precioCompraManual) url += `&buyPrice=${precioCompraManual}`;
    if (precioVentaManual)  url += `&sellPrice=${precioVentaManual}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });

    if (!resp.ok) {
      throw new Error(`Error ${resp.status}`);
    }

    const json = await resp.json();
    const data = json.data;

    renderResultados(data);

    loading.classList.add('hidden');
    resultados.classList.remove('hidden');

    // Scroll suave hacia los resultados
    resultados.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    console.error('[Calculadora]', err);
    loading.classList.add('hidden');
    alert('No se pudo calcular la proyección. Verifica tu conexión e intenta de nuevo.');
  } finally {
    btnCalcular.disabled = false;
    btnCalcular.innerHTML = '<span class="calc-btn-icon">⚡</span> Calcular Proyección';
  }
}

/**
 * Rellena todos los elementos del DOM con los resultados
 */
function renderResultados(data) {
  const { entrada, tasas_hoy, proyeccion, escenario_usdt,
          escenario_bcv, tendencias, recomendacion,
          precision_modelo, volatilidad_binance, calendario } = data;

  const dias = entrada.dias;

  // Actualizar "N días" en las etiquetas
  document.querySelectorAll('.calc-dias-texto').forEach((el) => {
    el.textContent = dias;
  });

  // --- VEREDICTO ---
  const veredicto    = document.getElementById('calc-veredicto');
  const icon         = document.getElementById('veredicto-icon');
  const titulo       = document.getElementById('veredicto-titulo');
  const descripcion  = document.getElementById('veredicto-descripcion');
  const badge        = document.getElementById('veredicto-badge');

  const iconosPorNivel = {
    excelente: '🚀',
    buena:     '✅',
    neutral:   '⚖️',
    mala:      '⛔',
  };

  const badgeInfo = {
    excelente: { texto: 'Excelente',     bg: 'rgba(16,185,129,0.2)',  color: '#10b981', border: '1px solid rgba(16,185,129,0.4)' },
    buena:     { texto: 'Recomendado',   bg: 'rgba(6,182,212,0.2)',   color: '#06b6d4', border: '1px solid rgba(6,182,212,0.4)' },
    neutral:   { texto: 'Con cautela',   bg: 'rgba(245,158,11,0.2)',  color: '#f59e0b', border: '1px solid rgba(245,158,11,0.4)' },
    mala:      { texto: 'No recomendado',bg: 'rgba(239,68,68,0.2)',   color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)' },
  };

  const nivel = recomendacion.nivel;
  veredicto.className = `calc-veredicto glass-card nivel-${nivel}`;
  icon.textContent = iconosPorNivel[nivel] || '🤔';
  titulo.textContent = `Proyección a ${dias} día${dias > 1 ? 's' : ''}`;
  descripcion.textContent = recomendacion.texto;

  const bi = badgeInfo[nivel];
  if (bi) {
    badge.textContent = bi.texto;
    badge.style.cssText = `background:${bi.bg}; color:${bi.color}; border:${bi.border}`;
  }

  // --- ESCENARIO USDT ---
  setText('calc-usdt-comprados', `${escenario_usdt.usdt_comprados_hoy.toFixed(4)} USDT`);
  setText('calc-bs-recuperados', `Bs. ${formatNum(escenario_usdt.bs_recuperados)}`);

  const ganBs = escenario_usdt.ganancia_bs;
  const elGanBs = document.getElementById('calc-ganancia-bs');
  elGanBs.textContent = `${ganBs >= 0 ? '+' : ''}Bs. ${formatNum(ganBs)}`;
  elGanBs.className = `metrica-valor ${ganBs >= 0 ? 'positivo' : 'negativo'}`;

  const rent = escenario_usdt.rentabilidad_pct;
  const elRent = document.getElementById('calc-rentabilidad');
  elRent.textContent = `${rent >= 0 ? '+' : ''}${rent.toFixed(3)}%`;
  elRent.className = `metrica-valor bold ${rent >= 0 ? 'positivo' : (rent < -0.5 ? 'negativo' : 'neutro')}`;

  // --- COSTO DE NO HACER NADA ---
  setText('calc-usd-hoy',    `Bs. ${tasas_hoy.usd_bcv.toFixed(3)}`);
  setText('calc-usd-futuro', `Bs. ${proyeccion.usd_bcv_futuro.toFixed(3)}`);

  const perdida    = escenario_bcv.perdida_inaccion_bs;
  const perdidaPct = escenario_bcv.perdida_inaccion_pct;

  const elPerdida = document.getElementById('calc-perdida-inaccion');
  if (elPerdida) {
    elPerdida.textContent = `-Bs. ${formatNum(Math.abs(perdida))}`;
    elPerdida.className = 'metrica-valor negativo';
  }
  const elPerdidaPct = document.getElementById('calc-perdida-pct');
  if (elPerdidaPct) {
    elPerdidaPct.textContent = `-${Math.abs(perdidaPct).toFixed(2)}%`;
    elPerdidaPct.className = 'metrica-valor bold negativo';
  }

  const ventaja = recomendacion.ventaja_vs_bcv_pct;
  const elVentaja = document.getElementById('calc-ventaja-bcv');
  if (elVentaja) {
    elVentaja.textContent = `${ventaja >= 0 ? '+' : ''}${ventaja.toFixed(2)}%`;
    elVentaja.className = `metrica-valor bold ${ventaja >= 0 ? 'positivo' : 'negativo'}`;
  }

  // --- TENDENCIAS ---
  const tc = tendencias.cambio_diario_usdt_compra;
  const tv = tendencias.cambio_diario_usdt_venta;
  const tb = tendencias.cambio_por_dia_habil_bcv || 0;
  setText('calc-tend-compra',
    `${tc >= 0 ? '↑' : '↓'} ${Math.abs(tc).toFixed(3)} Bs./día`);
  setText('calc-tend-venta',
    `${tv >= 0 ? '↑' : '↓'} ${Math.abs(tv).toFixed(3)} Bs./día`);
  setText('calc-dias-analizados',
    tendencias.dias_analizados > 0 ? `${tendencias.dias_analizados} días` : 'Sin historial');

  // Días hábiles del BCV en el período
  if (calendario) {
    const elHabiles = document.getElementById('calc-dias-habiles');
    if (elHabiles) {
      elHabiles.textContent = `${calendario.dias_habiles_bcv} días hábiles de ${calendario.dias_calendario} de calendario`;
    }
    const elTendBCV = document.getElementById('calc-tend-bcv');
    if (elTendBCV) {
      elTendBCV.textContent = `${tb >= 0 ? '↑' : '↓'} ${Math.abs(tb).toFixed(3)} Bs./día hábil`;
    }
  }

  // Badge de confianza
  const elConf = document.getElementById('calc-confianza');
  const confianzaLabel = { alta: 'Alta', media: 'Media', baja: 'Baja' };
  elConf.textContent = confianzaLabel[tendencias.confianza] || tendencias.confianza;
  elConf.className = `metrica-badge ${tendencias.confianza}`;

  // Advertencia si confianza baja
  const adv = document.getElementById('calc-advertencia');
  if (tendencias.confianza === 'baja') {
    adv.classList.remove('hidden');
  } else {
    adv.classList.add('hidden');
  }

  // --- VOLATILIDAD BINANCE ---
  const volBox = document.getElementById('calc-volatilidad');
  if (volBox && volatilidad_binance) {
    volBox.classList.remove('hidden');
    const v = volatilidad_binance;
    const colores = { baja: '#10b981', media: '#f59e0b', alta: '#ef4444', desconocida: '#8888bb' };
    const iconos  = { baja: '😌', media: '⚡', alta: '🌪️', desconocida: '❓' };
    const labels  = { baja: 'Estable', media: 'Moderada', alta: '¡Alta!', desconocida: '—' };
    const color   = colores[v.nivel] || '#8888bb';
    const volBadge = document.getElementById('calc-vol-badge');
    if (volBadge) {
      volBadge.textContent = `${iconos[v.nivel]} ${labels[v.nivel]}`;
      volBadge.style.cssText = `color:${color}; border-color:${color}40; background:${color}15`;
    }
    setText('calc-vol-nota', v.nota);
    if (v.dias_choque > 0) {
      const choque = document.getElementById('calc-vol-choque');
      if (choque) {
        choque.textContent = `⚠️ ${v.dias_choque} días de choque externo detectados (terremotos, crisis, noticias)`;
        choque.classList.remove('hidden');
      }
    }
  }

  // --- PRECISIÓN DEL MODELO (BACKTESTING) ---
  const precisionBox = document.getElementById('calc-backtest');
  if (precisionBox) {
    if (precision_modelo) {
      const p = precision_modelo;
      precisionBox.classList.remove('hidden');

      // Barra BCV
      renderPrecisionBar('backtest-bcv-bar',   'backtest-bcv-pct',   p.bcv.precision_pct,   p.bcv.error_promedio_pct);
      // Barra USDT
      renderPrecisionBar('backtest-usdt-bar',  'backtest-usdt-pct',  p.usdt.precision_pct,  p.usdt.error_promedio_pct);

      setText('backtest-bcv-nota',  p.bcv.nota);
      setText('backtest-usdt-nota', p.usdt.nota);
      setText('backtest-muestras',  `Basado en ${p.muestras_analizadas} ventanas de ${p.dias_proyectados} días analizadas`);

      // Nota sobre el BCV estancado
      const bcvEstable = document.getElementById('backtest-bcv-estable');
      if (bcvEstable) {
        bcvEstable.textContent = `📅 El BCV no cambia el ${p.bcv.dias_sin_cambio_pct}% de los días (sube por escalones, no gradualmente)`;
      }
    } else {
      precisionBox.classList.add('hidden');
    }
  }
}

// --- UTILIDADES ---

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatNum(num) {
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Dibuja una barra de precisión con color semáforo
 * @param {string} barId     - ID del elemento barra
 * @param {string} pctId     - ID del texto con el %
 * @param {number} precision - 0-100, precisión del modelo
 * @param {number} error     - % de error promedio
 */
function renderPrecisionBar(barId, pctId, precision, error) {
  const bar = document.getElementById(barId);
  const pct = document.getElementById(pctId);
  if (!bar || !pct) return;

  // Color semáforo
  let color;
  if (precision >= 90)      color = '#10b981'; // verde
  else if (precision >= 75) color = '#f59e0b'; // amarillo
  else                      color = '#ef4444'; // rojo

  bar.style.width  = `${Math.min(precision, 100)}%`;
  bar.style.background = color;
  pct.textContent  = `${precision.toFixed(1)}% preciso (error ±${error.toFixed(1)}%)`;
  pct.style.color  = color;
}
