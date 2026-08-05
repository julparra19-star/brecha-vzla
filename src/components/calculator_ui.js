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

    await ejecutarCalculo(monto, dias);
  });
}

/**
 * Llama al endpoint y renderiza los resultados
 */
async function ejecutarCalculo(monto, dias) {
  const loading     = document.getElementById('calc-loading');
  const resultados  = document.getElementById('calc-resultados');
  const btnCalcular = document.getElementById('btn-calcular');

  // Mostrar loading
  resultados.classList.add('hidden');
  loading.classList.remove('hidden');
  btnCalcular.disabled = true;
  btnCalcular.textContent = 'Calculando…';

  try {
    const url = `${API_BASE}/api/calculator?amount=${monto}&days=${dias}`;
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
          escenario_bcv, tendencias, recomendacion } = data;

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

  // --- ESCENARIO BCV ---
  setText('calc-usd-hoy',     `Bs. ${tasas_hoy.usd_bcv.toFixed(3)}`);
  setText('calc-usd-futuro',  `Bs. ${proyeccion.usd_bcv_futuro.toFixed(3)}`);

  const ganBCV = escenario_bcv.ganancia_bs;
  const elGanBCV = document.getElementById('calc-ganancia-bcv');
  elGanBCV.textContent = `${ganBCV >= 0 ? '+' : ''}Bs. ${formatNum(ganBCV)}`;
  elGanBCV.className = `metrica-valor ${ganBCV >= 0 ? 'positivo' : 'negativo'}`;

  const ventaja = recomendacion.ventaja_vs_bcv_pct;
  const elVentaja = document.getElementById('calc-ventaja-bcv');
  elVentaja.textContent = `${ventaja >= 0 ? '+' : ''}${ventaja.toFixed(3)}%`;
  elVentaja.className = `metrica-valor bold ${ventaja >= 0 ? 'positivo' : 'negativo'}`;

  // --- TENDENCIAS ---
  const tc = tendencias.cambio_diario_usdt_compra;
  const tv = tendencias.cambio_diario_usdt_venta;
  setText('calc-tend-compra',
    `${tc >= 0 ? '↑' : '↓'} ${Math.abs(tc).toFixed(3)} Bs./día`);
  setText('calc-tend-venta',
    `${tv >= 0 ? '↑' : '↓'} ${Math.abs(tv).toFixed(3)} Bs./día`);
  setText('calc-dias-analizados',
    tendencias.dias_analizados > 0 ? `${tendencias.dias_analizados} días` : 'Sin historial');

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
