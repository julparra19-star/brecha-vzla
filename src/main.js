// ============================================================
// main.js — Punto de entrada principal de BrechaVzla
// Inicialización del dashboard, auto-refresco y PWA
// ============================================================

import { fetchRates, fetchHistory } from './services/api.js';
import {
  requestPermission,
  scheduleAlerts,
  isNotificationSupported,
  showNotification,
} from './services/notifications.js';
import {
  updateMetricCard,
  updateGapCard,
  showLoadingState,
  hideLoadingState,
  updateTrend,
  formatCurrency,
  formatPercentage,
  getGapColorClass,
} from './components/dashboard.js';
import { initChart, updateChart } from './components/chart.js';
import { initCalculadora } from './components/calculator_ui.js';

// === CONSTANTES ===

// Intervalo de auto-refresco: 5 minutos
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// Almacén de valores previos para calcular tendencias
let _previousValues = {
  usd_bcv: 0,
  eur_bcv: 0,
  usdt_promedio: 0,
  usdt_compra: 0,
  usdt_venta: 0,
};

// Referencia para el evento de instalación PWA
let _deferredInstallPrompt = null;

// ============================================================
// INICIALIZACIÓN
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('[BrechaVzla] Iniciando aplicación…');

  // 1. Registrar Service Worker
  registerServiceWorker();

  // 2. Inicializar gráfico
  initChart('rates-chart');

  // 3. Inicializar calculadora de proyección
  initCalculadora();

  // 4. Inicializar filtros de tiempo
  initFilterButtons();

  // 5. Cargar datos iniciales
  initDashboard();

  // 4. Configurar auto-refresco cada 5 minutos
  setInterval(() => {
    fetchAndUpdateDashboard();
    fetchAndUpdateHistory();
  }, REFRESH_INTERVAL_MS);

  // 5. Configurar notificaciones programadas
  setupNotifications();

  // 6. Manejar evento de instalación PWA
  setupPWAInstall();

  // 7. Vincular botón de notificaciones
  setupNotificationButton();
});

// ============================================================
// SERVICE WORKER
// ============================================================

/**
 * Registra el service worker para funcionalidad offline/PWA
 */
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service Worker no soportado');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('[SW] Service Worker registrado:', registration.scope);
  } catch (error) {
    console.warn('[SW] Error al registrar Service Worker:', error.message);
  }
}

// ============================================================
// DASHBOARD PRINCIPAL
// ============================================================

/**
 * Inicializa el dashboard cargando todos los datos
 */
async function initDashboard() {
  showLoadingState();

  // Cargar tasas y historial en paralelo
  await Promise.all([
    fetchAndUpdateDashboard(),
    fetchAndUpdateHistory(),
  ]);

  hideLoadingState();
}

/**
 * Obtiene las tasas actuales y actualiza todos los elementos del DOM
 */
async function fetchAndUpdateDashboard() {
  const data = await fetchRates();

  if (!data) {
    console.error('[Dashboard] No se pudieron obtener las tasas');
    return;
  }

  // --- BCV ---
  if (data.bcv) {
    const usdBcv = parseFloat(data.bcv.usd) || 0;
    const eurBcv = parseFloat(data.bcv.eur) || 0;

    updateMetricCard('value-usd-bcv', usdBcv);
    updateMetricCard('value-eur-bcv', eurBcv);

    // Tendencias
    updateTrend('trend-usd-bcv', usdBcv, _previousValues.usd_bcv);
    updateTrend('trend-eur-bcv', eurBcv, _previousValues.eur_bcv);

    // Guardar valores previos
    _previousValues.usd_bcv = usdBcv;
    _previousValues.eur_bcv = eurBcv;
  }

  // --- BINANCE P2P ---
  if (data.binance) {
    const promedio = parseFloat(data.binance.promedio) || 0;
    const compra = parseFloat(data.binance.compra) || 0;
    const venta = parseFloat(data.binance.venta) || 0;

    updateMetricCard('value-usdt-promedio', promedio);
    updateMetricCard('value-usdt-compra', compra);
    updateMetricCard('value-usdt-venta', venta);

    // Tendencias
    updateTrend('trend-usdt-promedio', promedio, _previousValues.usdt_promedio);
    updateTrend('trend-usdt-compra', compra, _previousValues.usdt_compra);
    updateTrend('trend-usdt-venta', venta, _previousValues.usdt_venta);

    // Guardar valores previos
    _previousValues.usdt_promedio = promedio;
    _previousValues.usdt_compra = compra;
    _previousValues.usdt_venta = venta;
  }

  // --- BRECHAS ---
  if (data.brechas) {
    const brechaUsd = parseFloat(data.brechas.brecha_usd_usdt) || 0;
    const brechaEur = parseFloat(data.brechas.brecha_eur_usdt) || 0;
    const spreadUsdt = parseFloat(data.brechas.spread_usdt) || 0;

    updateGapCard('value-brecha-usd', brechaUsd);
    updateGapCard('value-brecha-eur', brechaEur);
    updateGapCard('value-spread-usdt', spreadUsdt);
  }

  // --- TIMESTAMP ---
  updateTimestamp(data.timestamp);
}

/**
 * Obtiene el historial y actualiza la tabla y el gráfico
 * @param {string} filter - 'last10'|'today'|'week'|'month'
 */
async function fetchAndUpdateHistory(filter = 'last10') {
  const history = await fetchHistory(filter);

  if (!history || !Array.isArray(history) || history.length === 0) {
    console.error('[Dashboard] No se pudo obtener el historial');
    renderHistoryTable([]);
    return;
  }

  let dataToRender = [...history];

  // Determinar rango de tiempo (history viene ordenado del más nuevo al más antiguo)
  const tNewest = new Date(dataToRender[0].created_at || dataToRender[0].timestamp || dataToRender[0].fecha).getTime();
  const tOldest = new Date(dataToRender[dataToRender.length - 1].created_at || dataToRender[dataToRender.length - 1].timestamp || dataToRender[dataToRender.length - 1].fecha).getTime();
  const spanHours = (tNewest - tOldest) / (1000 * 60 * 60);

  if (spanHours > 48) {
    const grouped = {};
    dataToRender.forEach(record => {
      const d = new Date(record.created_at || record.timestamp || record.fecha);
      if (isNaN(d.getTime())) return;
      
      const dateKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      if (!grouped[dateKey]) {
        grouped[dateKey] = {
          count: 0,
          dateObj: d,
          usd_bcv: 0,
          eur_bcv: 0,
          usdt_promedio: 0,
          brecha_usd: 0
        };
      }
      
      const g = grouped[dateKey];
      g.count++;
      
      if (record.bcv) {
        g.usd_bcv += parseFloat(record.bcv.usd) || 0;
        g.eur_bcv += parseFloat(record.bcv.eur) || 0;
      } else {
        g.usd_bcv += parseFloat(record.usd_bcv) || parseFloat(record.usd) || 0;
        g.eur_bcv += parseFloat(record.eur_bcv) || parseFloat(record.eur) || 0;
      }
      
      if (record.binance) g.usdt_promedio += parseFloat(record.binance.promedio) || 0;
      else g.usdt_promedio += parseFloat(record.usdt_promedio) || parseFloat(record.promedio) || 0;
      
      if (record.brechas) g.brecha_usd += parseFloat(record.brechas.brecha_usd_usdt) || 0;
      else g.brecha_usd += parseFloat(record.brecha_usd_usdt) || parseFloat(record.brecha_usd) || 0;
    });

    dataToRender = Object.values(grouped).map(g => ({
      created_at: g.dateObj.toISOString(),
      usd_bcv: g.usd_bcv / g.count,
      eur_bcv: g.eur_bcv / g.count,
      usdt_promedio: g.usdt_promedio / g.count,
      brecha_usd_usdt: g.brecha_usd / g.count,
      _spanHours: spanHours // Flag flag para que el chart sepa que ya está agrupado
    })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // Volver a ordenar newest -> oldest
  }

  // Actualizar tabla
  renderHistoryTable(dataToRender);

  // Actualizar gráfico
  updateChart(dataToRender);
}

/**
 * Inicializa los botones de filtro de tiempo para tabla y gráfico
 */
function initFilterButtons() {
  // Ambos filter-bars sincronizan juntos
  const allFilterBars = ['table-filter-bar', 'chart-filter-bar'];

  allFilterBars.forEach((barId) => {
    const bar = document.getElementById(barId);
    if (!bar) return;

    bar.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        // Marcar activo en AMBAS barras
        allFilterBars.forEach((id) => {
          const b = document.getElementById(id);
          if (b) b.querySelectorAll('.filter-btn').forEach((b2) => {
            b2.classList.toggle('active', b2.dataset.filter === btn.dataset.filter);
          });
        });

        // Recargar historial con el filtro seleccionado
        fetchAndUpdateHistory(btn.dataset.filter);
      });
    });
  });

  // Exportar Excel
  const btnExport = document.getElementById('btn-export-excel');
  if (btnExport) {
    btnExport.addEventListener('click', (e) => {
      e.preventDefault(); // Prevenir cualquier comportamiento por defecto
      const a = document.createElement('a');
      a.href = '/api/export-excel';
      a.download = 'historial_9am_5pm.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  }
}

// ============================================================
// RENDERIZADO DE TABLA
// ============================================================

/**
 * Renderiza las filas de la tabla con los datos históricos
 * @param {Array} historyData - Array de registros históricos
 */
function renderHistoryTable(historyData) {
  const tbody = document.getElementById('history-table-body');
  if (!tbody) return;

  // Limpiar contenido anterior
  tbody.innerHTML = '';

  // Si no hay datos, mostrar mensaje
  if (historyData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 2rem;">
          No hay registros históricos disponibles
        </td>
      </tr>
    `;
    return;
  }

  // Crear filas (mostrar hasta 31 registros para cubrir el mes agrupado)
  const recentData = historyData.slice(0, 31);

  recentData.forEach((record) => {
    const row = document.createElement('tr');

    // Extraer valores según la estructura (plana o anidada)
    const fecha = formatDate(record.created_at || record.timestamp || record.fecha || '', record._spanHours > 48);
    const usdBcv = record.bcv ? record.bcv.usd : (record.usd_bcv || record.usd || 0);
    const eurBcv = record.bcv ? record.bcv.eur : (record.eur_bcv || record.eur || 0);
    const usdtProm = record.binance ? record.binance.promedio : (record.usdt_promedio || record.promedio || 0);
    const brechaUsd = record.brechas ? record.brechas.usd_usdt : (record.brecha_usd || record.brecha_usd_usdt || 0);

    // Determinar clase de color para la brecha
    const gapClass = `table-gap-${getGapColorClass(parseFloat(brechaUsd) || 0)}`;

    row.innerHTML = `
      <td>${fecha}</td>
      <td>${formatCurrency(usdBcv)}</td>
      <td>${formatCurrency(eurBcv)}</td>
      <td>${formatCurrency(usdtProm)}</td>
      <td class="${gapClass}">${formatPercentage(brechaUsd)}</td>
    `;

    tbody.appendChild(row);
  });
}

// ============================================================
// UTILIDADES
// ============================================================

/**
 * Formatea una fecha para mostrar en la interfaz
 * @param {string} dateStr - Cadena de fecha ISO o similar
 * @returns {string} Fecha formateada
 */
function formatDate(dateStr, isGrouped = false) {
  if (!dateStr) return '—';

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const options = {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  };

  if (!isGrouped) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }

  const result = date.toLocaleDateString('es-VE', options);
  return isGrouped ? `${result} (Promedio)` : result;
}

/**
 * Actualiza el timestamp de la última actualización en el header
 * @param {string} timestamp - Timestamp ISO del backend
 */
function updateTimestamp(timestamp) {
  const element = document.getElementById('last-update-time');
  if (!element) return;

  if (timestamp) {
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      element.textContent = date.toLocaleTimeString('es-VE', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      return;
    }
  }

  // Si no hay timestamp del backend, usar la hora actual
  element.textContent = new Date().toLocaleTimeString('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ============================================================
// NOTIFICACIONES
// ============================================================

/**
 * Configura las notificaciones programadas
 */
function setupNotifications() {
  if (!isNotificationSupported()) return;

  // Si ya tiene permiso, iniciar el scheduler
  if (Notification.permission === 'granted') {
    scheduleAlerts(async () => {
      return await fetchRates();
    });
  }
}

/**
 * Vincula el botón de notificaciones del header
 */
function setupNotificationButton() {
  const btn = document.getElementById('btn-notifications');
  if (!btn) return;

  // Actualizar aspecto según estado actual
  updateNotificationButtonState(btn);

  btn.addEventListener('click', async () => {
    if (!isNotificationSupported()) {
      alert('Tu navegador no soporta notificaciones.');
      return;
    }

    const permission = await requestPermission();

    if (permission === 'granted') {
      showNotification('🎉 ¡Notificaciones activadas!', 'Recibirás alertas a las 9:00, 12:00 y 18:00 con las tasas actualizadas.');
      scheduleAlerts(async () => await fetchRates());
    } else if (permission === 'denied') {
      alert('Las notificaciones fueron bloqueadas. Puedes habilitarlas en la configuración de tu navegador.');
    }

    updateNotificationButtonState(btn);
  });
}

/**
 * Actualiza el aspecto visual del botón de notificaciones
 * @param {HTMLElement} btn - Elemento del botón
 */
function updateNotificationButtonState(btn) {
  if (!isNotificationSupported()) {
    btn.style.opacity = '0.4';
    btn.title = 'Notificaciones no soportadas';
    return;
  }

  if (Notification.permission === 'granted') {
    btn.style.color = 'var(--accent-green)';
    btn.title = 'Notificaciones activadas';
  } else if (Notification.permission === 'denied') {
    btn.style.opacity = '0.4';
    btn.title = 'Notificaciones bloqueadas';
  } else {
    btn.title = 'Activar notificaciones';
  }
}

// ============================================================
// PWA — INSTALACIÓN
// ============================================================

/**
 * Configura el manejo del prompt de instalación PWA
 */
function setupPWAInstall() {
  const btnInstall = document.getElementById('btn-install');
  if (!btnInstall) return;

  // Capturar el evento beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevenir que el navegador muestre su propio prompt
    e.preventDefault();

    // Guardar el evento para usarlo después
    _deferredInstallPrompt = e;

    // Mostrar el botón de instalación
    btnInstall.classList.remove('hidden');

    console.log('[PWA] Evento de instalación capturado');
  });

  // Manejar clic en el botón de instalar
  btnInstall.addEventListener('click', async () => {
    if (!_deferredInstallPrompt) return;

    // Mostrar el prompt de instalación nativo
    _deferredInstallPrompt.prompt();

    // Esperar la decisión del usuario
    const { outcome } = await _deferredInstallPrompt.userChoice;
    console.log('[PWA] Resultado de instalación:', outcome);

    // Limpiar — solo se puede usar una vez
    _deferredInstallPrompt = null;
    btnInstall.classList.add('hidden');
  });

  // Detectar si ya se instaló la app
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] Aplicación instalada exitosamente');
    _deferredInstallPrompt = null;
    btnInstall.classList.add('hidden');
  });
}
