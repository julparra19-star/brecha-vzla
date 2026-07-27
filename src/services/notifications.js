// ============================================================
// notifications.js — Sistema de Notificaciones para BrechaVzla
// Gestión de permisos, alertas programadas y mensajes formateados
// ============================================================

// Intervalo del scheduler (se guarda para poder limpiarlo)
let _schedulerInterval = null;

// Última hora en que se disparó una alerta (para evitar duplicados)
let _lastAlertHour = -1;

// Horas programadas para alertas automáticas
const ALERT_HOURS = [9, 12, 18];

/**
 * Verifica si la API de Notificaciones está disponible
 * @returns {boolean}
 */
export function isNotificationSupported() {
  return 'Notification' in window;
}

/**
 * Solicita permiso al usuario para enviar notificaciones
 * @returns {Promise<string>} Estado del permiso: 'granted', 'denied', 'default'
 */
export async function requestPermission() {
  if (!isNotificationSupported()) {
    console.warn('[Notificaciones] API no soportada en este navegador');
    return 'denied';
  }

  // Si ya se concedió, retornar directamente
  if (Notification.permission === 'granted') {
    return 'granted';
  }

  // Si fue denegado permanentemente, no volver a pedir
  if (Notification.permission === 'denied') {
    console.warn('[Notificaciones] Permiso denegado por el usuario');
    return 'denied';
  }

  // Solicitar permiso
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch (error) {
    console.error('[Notificaciones] Error al solicitar permiso:', error);
    return 'denied';
  }
}

/**
 * Muestra una notificación del navegador
 * @param {string} title - Título de la notificación
 * @param {string} body - Cuerpo del mensaje
 * @param {Object} [data] - Datos adicionales opcionales
 */
export function showNotification(title, body, data = {}) {
  if (!isNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;

  try {
    const notification = new Notification(title, {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: 'brechavzla-alert', // Reemplaza notificaciones anteriores con el mismo tag
      renotify: true,
      data,
      vibrate: [200, 100, 200], // Patrón de vibración
    });

    // Cerrar automáticamente después de 8 segundos
    setTimeout(() => notification.close(), 8000);

    // Al hacer clic, enfocar la ventana de la app
    notification.onclick = () => {
      window.focus();
      notification.close();
    };

  } catch (error) {
    console.error('[Notificaciones] Error al mostrar notificación:', error);
  }
}

/**
 * Formatea un mensaje legible con las tasas y brechas actuales
 * @param {Object} ratesData - Datos de /api/rates
 * @returns {string} Mensaje formateado
 */
export function formatAlertMessage(ratesData) {
  if (!ratesData) return 'No se pudieron obtener las tasas actuales.';

  const { bcv, binance, brechas } = ratesData;

  const lines = [];

  if (bcv) {
    lines.push(`💵 USD BCV: Bs. ${Number(bcv.usd).toFixed(3)}`);
    lines.push(`💶 EUR BCV: Bs. ${Number(bcv.eur).toFixed(3)}`);
  }

  if (binance) {
    lines.push(`🔄 USDT Prom: Bs. ${Number(binance.promedio).toFixed(3)}`);
  }

  if (brechas) {
    lines.push(`📐 Brecha USD: ${Number(brechas.brecha_usd_usdt).toFixed(3)}%`);
    lines.push(`📐 Brecha EUR: ${Number(brechas.brecha_eur_usdt).toFixed(3)}%`);
  }

  return lines.join('\n');
}

/**
 * Inicia el scheduler que revisa cada minuto si es hora de enviar alertas
 * Las alertas se disparan a las 9:00, 12:00 y 18:00
 * @param {Function} getRatesCallback - Función que retorna los datos actuales de tasas
 */
export function scheduleAlerts(getRatesCallback) {
  // Limpiar scheduler anterior si existe
  if (_schedulerInterval) {
    clearInterval(_schedulerInterval);
  }

  // Revisar cada 60 segundos
  _schedulerInterval = setInterval(async () => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Solo disparar al minuto 0 de las horas programadas
    if (currentMinute === 0 && ALERT_HOURS.includes(currentHour) && _lastAlertHour !== currentHour) {
      _lastAlertHour = currentHour;

      // Obtener datos actualizados
      let ratesData = null;
      if (typeof getRatesCallback === 'function') {
        ratesData = await getRatesCallback();
      }

      const message = formatAlertMessage(ratesData);
      showNotification('📊 BrechaVzla — Actualización', message);
    }

    // Resetear el control de hora duplicada cuando cambie la hora
    if (!ALERT_HOURS.includes(currentHour)) {
      _lastAlertHour = -1;
    }

  }, 60000); // Cada 60 segundos
}

/**
 * Detiene el scheduler de alertas
 */
export function stopAlerts() {
  if (_schedulerInterval) {
    clearInterval(_schedulerInterval);
    _schedulerInterval = null;
  }
}
