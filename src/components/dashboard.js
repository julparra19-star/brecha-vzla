// ============================================================
// dashboard.js — Componente de renderizado del Dashboard
// Animaciones numéricas, estados de carga y formateo de valores
// ============================================================

/**
 * Actualiza una tarjeta de métrica con transición animada
 * @param {string} elementId - ID del elemento que muestra el valor
 * @param {number} value - Nuevo valor numérico
 * @param {string} [label] - Etiqueta opcional (no usado actualmente, reservado)
 */
export function updateMetricCard(elementId, value, label) {
  const element = document.getElementById(elementId);
  if (!element) return;

  // Obtener valor anterior para animar
  const previousText = element.textContent.replace(/[^\d.-]/g, '');
  const previousValue = parseFloat(previousText) || 0;
  const newValue = parseFloat(value) || 0;

  // Limpiar skeleton si existe
  const skeleton = element.querySelector('.skeleton-text');
  if (skeleton) {
    element.innerHTML = '';
  }

  // Animar la transición del valor
  animateValue(element, previousValue, newValue, 800);

  // Efecto visual de actualización (flash)
  const card = element.closest('.metric-card');
  if (card) {
    card.classList.add('card-updated');
    setTimeout(() => card.classList.remove('card-updated'), 1200);
  }
}

/**
 * Actualiza una tarjeta de brecha con código de color
 * @param {string} elementId - ID del elemento que muestra el valor de brecha
 * @param {number} value - Valor de la brecha en porcentaje
 */
export function updateGapCard(elementId, value) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const numValue = parseFloat(value) || 0;

  // Limpiar skeleton
  const skeleton = element.querySelector('.skeleton-text');
  if (skeleton) {
    element.innerHTML = '';
  }

  // Obtener valor anterior
  const previousText = element.textContent.replace(/[^\d.-]/g, '');
  const previousValue = parseFloat(previousText) || 0;

  // Animar valor
  animateValue(element, previousValue, numValue, 800);

  // Aplicar clase de color según el valor
  const colorClass = getGapColorClass(numValue);
  element.className = 'card-value gap-value'; // Resetear clases
  element.classList.add(`gap-${colorClass}`);

  // Actualizar barra visual de brecha
  const barId = elementId.replace('value-', 'bar-');
  const bar = document.getElementById(barId);
  if (bar) {
    const absValue = Math.min(Math.abs(numValue), 10); // Máximo 10% para la barra
    const width = (absValue / 10) * 100;
    bar.style.width = `${width}%`;
    bar.className = 'gap-bar';
    bar.classList.add(`gap-bar-${colorClass}`);
  }

  // Color del contenedor de la tarjeta
  const card = element.closest('.metric-card');
  if (card) {
    card.setAttribute('data-gap-level', colorClass);
    card.classList.add('card-updated');
    setTimeout(() => card.classList.remove('card-updated'), 1200);
  }
}

/**
 * Anima suavemente la transición de un valor numérico
 * @param {HTMLElement} element - Elemento DOM a actualizar
 * @param {number} start - Valor inicial
 * @param {number} end - Valor final
 * @param {number} duration - Duración de la animación en ms
 */
export function animateValue(element, start, end, duration) {
  // Si son iguales, solo mostrar el valor
  if (Math.abs(start - end) < 0.001) {
    element.textContent = end.toFixed(3);
    return;
  }

  const startTime = performance.now();
  const diff = end - start;

  function step(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Función de easing: easeOutExpo para un efecto más suave
    const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

    const currentValue = start + diff * eased;
    element.textContent = currentValue.toFixed(3);

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

/**
 * Muestra el estado de carga (overlay con spinner)
 */
export function showLoadingState() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.add('active');
  }
}

/**
 * Oculta el estado de carga
 */
export function hideLoadingState() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    // Remover completamente después de la transición
    setTimeout(() => {
      overlay.style.pointerEvents = 'none';
    }, 500);
  }
}

/**
 * Formatea un valor como moneda venezolana (Bs.)
 * @param {number} value - Valor numérico
 * @returns {string} Valor formateado con 3 decimales y prefijo Bs.
 */
export function formatCurrency(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return 'Bs. ---.---';
  return `Bs. ${num.toFixed(3)}`;
}

/**
 * Formatea un valor como porcentaje
 * @param {number} value - Valor numérico
 * @returns {string} Valor formateado con 3 decimales y sufijo %
 */
export function formatPercentage(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return '---.---%';
  return `${num.toFixed(3)}%`;
}

/**
 * Determina la clase de color según el valor de la brecha
 * @param {number} value - Valor de la brecha en porcentaje
 * @returns {string} 'positive' (verde), 'neutral' (amarillo), o 'negative' (rojo)
 */
export function getGapColorClass(value) {
  const absValue = Math.abs(value);

  if (absValue <= 2) {
    return 'positive';  // Verde — brecha baja, buena señal
  } else if (absValue <= 5) {
    return 'neutral';   // Amarillo — brecha moderada
  } else {
    return 'negative';  // Rojo — brecha alta, mala señal
  }
}

/**
 * Actualiza el indicador de tendencia (flecha arriba/abajo)
 * @param {string} trendElementId - ID del elemento de tendencia
 * @param {number} currentValue - Valor actual
 * @param {number} previousValue - Valor anterior
 */
export function updateTrend(trendElementId, currentValue, previousValue) {
  const element = document.getElementById(trendElementId);
  if (!element) return;

  const current = parseFloat(currentValue) || 0;
  const previous = parseFloat(previousValue) || 0;
  const diff = current - previous;

  if (Math.abs(diff) < 0.001) {
    element.textContent = '→';
    element.className = 'card-trend trend-neutral';
  } else if (diff > 0) {
    element.textContent = '↑';
    element.className = 'card-trend trend-up';
  } else {
    element.textContent = '↓';
    element.className = 'card-trend trend-down';
  }
}
