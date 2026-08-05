// =============================================================================
// Servidor Express.js Principal
// Monitor de tasas de cambio venezolanas (BCV + Binance P2P)
// =============================================================================

// Cargar variables de entorno desde .env
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');

// Importar servicios
const { fetchBCVRates } = require('./services/bcv');
const { fetchBinanceP2P } = require('./services/binance');
const { calculateGaps } = require('./services/calculator');
const { saveRates, getHistory, isConfigured } = require('./services/supabase');
const { calcularProyeccion } = require('./services/calculator_projection');

// Configuración del servidor
const PORT = process.env.PORT || 3000;
const app = express();

// =============================================================================
// Middleware
// =============================================================================

// Habilitar CORS para permitir requests desde el frontend
app.use(cors());

// Parsear body como JSON
app.use(express.json());

// Servir archivos estáticos del frontend (build de producción)
app.use(express.static(path.join(__dirname, '..', 'dist')));

// =============================================================================
// Rutas de la API
// =============================================================================

/**
 * GET /api/bcv
 * Retorna las tasas oficiales del BCV (USD y EUR) con 3 decimales
 */
app.get('/api/bcv', async (req, res) => {
  try {
    const data = await fetchBCVRates();

    if (!data) {
      return res.status(503).json({
        error: 'No se pudieron obtener las tasas del BCV',
        message: 'El servicio del BCV no está disponible temporalmente',
      });
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[API /bcv] Error:', error.message);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: error.message,
    });
  }
});

/**
 * GET /api/binance/p2p
 * Retorna los precios de compra, venta y promedio de USDT/VES en Binance P2P
 */
app.get('/api/binance/p2p', async (req, res) => {
  try {
    const data = await fetchBinanceP2P();

    if (!data || (data.compra === null && data.venta === null)) {
      return res.status(503).json({
        error: 'No se pudieron obtener los precios de Binance P2P',
        message: 'El servicio de Binance P2P no está disponible temporalmente',
      });
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[API /binance/p2p] Error:', error.message);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: error.message,
    });
  }
});

/**
 * GET /api/rates
 * Retorna todos los datos combinados: BCV + Binance P2P + brechas calculadas
 * Este es el endpoint principal que consume el frontend
 */
app.get('/api/rates', async (req, res) => {
  try {
    // Obtener datos de ambas fuentes en paralelo
    const [bcvData, binanceData] = await Promise.all([
      fetchBCVRates(),
      fetchBinanceP2P(),
    ]);

    // Calcular brechas (funciona parcialmente si falta algún dato)
    const result = calculateGaps(bcvData, binanceData);

    res.json({
      success: true,
      data: result,
      supabase_configured: isConfigured(),
    });
  } catch (error) {
    console.error('[API /rates] Error:', error.message);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: error.message,
    });
  }
});

/**
 * GET /api/history
 * Retorna el historial de tasas guardadas en Supabase
 * Query params:
 *   filter: 'last10' (default) | 'today' | 'week' | 'month'
 *   limit:  máximo de registros (default 500)
 */
app.get('/api/history', async (req, res) => {
  try {
    const filter = req.query.filter || 'last10';
    const limit  = parseInt(req.query.limit) || 500;
    const history = await getHistory(limit, filter);

    res.json({
      success: true,
      data: history,
      count: history.length,
      filter,
      supabase_configured: isConfigured(),
    });
  } catch (error) {
    console.error('[API /history] Error:', error.message);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: error.message,
    });
  }
});

/**
 * POST /api/save-rates
 * Obtiene las tasas actuales y las guarda en Supabase
 * Útil para guardado manual o desde el frontend
 */
app.post('/api/save-rates', async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(400).json({
        error: 'Supabase no está configurado',
        message: 'Configure las variables SUPABASE_URL y SUPABASE_KEY en el archivo .env',
      });
    }

    // Obtener datos actuales
    const [bcvData, binanceData] = await Promise.all([
      fetchBCVRates(),
      fetchBinanceP2P(),
    ]);

    // Calcular brechas
    const result = calculateGaps(bcvData, binanceData);

    // Guardar en Supabase
    const saved = await saveRates(result);

    if (!saved) {
      return res.status(500).json({
        error: 'No se pudieron guardar las tasas',
        message: 'Error al insertar en Supabase',
      });
    }

    res.json({
      success: true,
      message: 'Tasas guardadas exitosamente',
      data: result,
    });
  } catch (error) {
    console.error('[API /save-rates] Error:', error.message);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: error.message,
    });
  }
});

/**
 * GET /api/calculator
 * Proyecta el valor futuro de un monto dado X días hacia el futuro
 * Query params: amount (Bs.), days (días a proyectar)
 */
app.get('/api/calculator', async (req, res) => {
  try {
    const monto = parseFloat(req.query.amount);
    const dias = parseInt(req.query.days);
    const buyPriceManual  = req.query.buyPrice  ? parseFloat(req.query.buyPrice)  : null;
    const sellPriceManual = req.query.sellPrice ? parseFloat(req.query.sellPrice) : null;

    if (!monto || monto <= 0) {
      return res.status(400).json({ error: 'El parámetro "amount" debe ser un número positivo' });
    }
    if (!dias || dias < 1 || dias > 90) {
      return res.status(400).json({ error: 'El parámetro "days" debe estar entre 1 y 90' });
    }

    const [[bcvData, binanceData], historial] = await Promise.all([
      Promise.all([fetchBCVRates(), fetchBinanceP2P()]),
      getHistory(500, 'month'),
    ]);

    const tasasActuales = calculateGaps(bcvData, binanceData);

    // Sobrescribir precios de Binance con valores manuales si se proveyeron
    // En P2P: El usuario COMPRA al precio de VENTA de los comerciantes (usdt_venta)
    //         El usuario VENDE al precio de COMPRA de los comerciantes (usdt_compra)
    if (buyPriceManual && tasasActuales.binance) {
      tasasActuales.binance.venta = buyPriceManual;
    }
    if (sellPriceManual && tasasActuales.binance) {
      tasasActuales.binance.compra = sellPriceManual;
    }
    if ((buyPriceManual || sellPriceManual) && tasasActuales.binance) {
      tasasActuales.binance.promedio = (tasasActuales.binance.venta + tasasActuales.binance.compra) / 2;
    }

    const resultado = calcularProyeccion(monto, dias, historial, tasasActuales);
    // Marcar si se usaron precios manuales
    resultado.precios_manuales = !!(buyPriceManual || sellPriceManual);

    res.json({ success: true, data: resultado });
  } catch (error) {
    console.error('[API /calculator] Error:', error.message);
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
});

// =============================================================================
// Ruta catch-all para SPA (Single Page Application)
// Redirige todas las rutas no-API al frontend
// =============================================================================
app.get('*', (req, res) => {
  // Solo servir index.html si no es una ruta de API
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
});

// =============================================================================
// Tarea Cron: Guardado automático de tasas
// Se ejecuta a las 9:00 AM, 12:00 PM y 6:00 PM (hora del servidor)
// =============================================================================
const CRON_SCHEDULE = '0 9,12,18 * * *';

cron.schedule(CRON_SCHEDULE, async () => {
  console.log(`\n[CRON] ⏰ Ejecutando tarea programada - ${new Date().toLocaleString('es-VE')}`);

  try {
    // Obtener datos de ambas fuentes
    const [bcvData, binanceData] = await Promise.all([
      fetchBCVRates(),
      fetchBinanceP2P(),
    ]);

    // Calcular brechas
    const result = calculateGaps(bcvData, binanceData);

    // Loguear resumen
    console.log('[CRON] 📊 Datos obtenidos:');
    console.log(`  - USD BCV: ${result.bcv?.usd || 'N/A'}`);
    console.log(`  - EUR BCV: ${result.bcv?.eur || 'N/A'}`);
    console.log(`  - USDT Compra: ${result.binance?.compra || 'N/A'}`);
    console.log(`  - USDT Venta: ${result.binance?.venta || 'N/A'}`);
    console.log(`  - Brecha USD/USDT: ${result.brechas?.brecha_usd_usdt || 'N/A'}%`);

    // Guardar en Supabase si está configurado
    if (isConfigured()) {
      const saved = await saveRates(result);
      if (saved) {
        console.log('[CRON] ✅ Datos guardados en Supabase');
      } else {
        console.error('[CRON] ❌ Error al guardar en Supabase');
      }
    } else {
      console.warn('[CRON] ⚠️  Supabase no configurado, datos no persistidos');
    }
  } catch (error) {
    console.error('[CRON] ❌ Error en tarea programada:', error.message);
  }
});

console.log(`[CRON] 📅 Tarea programada: ${CRON_SCHEDULE} (9:00, 12:00, 18:00)`);

// =============================================================================
// Keep-Alive: Evita que Render duerma el servidor en el plan gratuito
// Hace un ping a sí mismo cada 10 minutos usando su propia URL pública
// RENDER_EXTERNAL_URL es provista automáticamente por Render en producción
// =============================================================================
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
const KEEPALIVE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutos

if (RENDER_URL) {
  setInterval(async () => {
    try {
      // Doble función: mantener el servidor despierto Y guardar datos históricos
      // Esto da a la calculadora datos cada 10 min para proyecciones más precisas
      if (isConfigured()) {
        // Con Supabase configurado: guardar tasas (también hace el ping)
        const [bcvData, binanceData] = await Promise.all([fetchBCVRates(), fetchBinanceP2P()]);
        const result = calculateGaps(bcvData, binanceData);
        const saved = await saveRates(result);
        const hora = new Date().toLocaleTimeString('es-VE');
        if (saved) {
          console.log(`[Keep-Alive] 💓 Datos guardados en Supabase - ${hora}`);
        } else {
          console.warn(`[Keep-Alive] ⚠️  Ping OK pero fallo al guardar - ${hora}`);
        }
      } else {
        // Sin Supabase: solo ping para no dormirse
        const pingUrl = `${RENDER_URL}/api/rates`;
        const response = await fetch(pingUrl, { signal: AbortSignal.timeout(10000) });
        console.log(`[Keep-Alive] 💓 Ping - status ${response.status} - ${new Date().toLocaleTimeString('es-VE')}`);
      }
    } catch (error) {
      console.warn('[Keep-Alive] ⚠️  Error:', error.message);
    }
  }, KEEPALIVE_INTERVAL_MS);

  console.log(`[Keep-Alive] 🔁 Activo: guarda datos cada 10 min → ${RENDER_URL}`);
} else {
  console.log('[Keep-Alive] ℹ️  Sin RENDER_EXTERNAL_URL (local, no se necesita)');
}

// =============================================================================
// Iniciar servidor
// =============================================================================
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('  Monitor de Tasas de Cambio - Venezuela');
  console.log('='.repeat(60));
  console.log(`  🚀 Servidor corriendo en: http://localhost:${PORT}`);
  console.log(`  📡 API disponible en:     http://localhost:${PORT}/api`);
  console.log(`  💾 Supabase:              ${isConfigured() ? '✅ Configurado' : '⚠️  No configurado'}`);
  console.log(`  ⏰ Cron:                  ${CRON_SCHEDULE}`);
  console.log(`  💓 Keep-Alive:            ${RENDER_URL ? 'Activo (cada 10 min)' : 'Inactivo (local)'}`);
  console.log('='.repeat(60));
});

module.exports = app;
