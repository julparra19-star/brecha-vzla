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
      Promise.all([fetchBCVRates(), fetchBinanceP2P(monto)]),
      getHistory(500, 'month'),
    ]);

    const tasasActuales = calculateGaps(bcvData, binanceData);

    const resultado = calcularProyeccion(monto, dias, historial, tasasActuales, buyPriceManual, sellPriceManual);
    // Marcar si se usaron precios manuales
    resultado.precios_manuales = !!(buyPriceManual || sellPriceManual);

    res.json({ success: true, data: resultado });
  } catch (error) {
    console.error('[API /calculator] Error:', error.message);
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
});

/**
 * GET /api/export-excel
 * Exporta el historial a Excel filtrando solo los cortes más cercanos a 9 AM y 5 PM por día
 */
app.get('/api/export-excel', async (req, res) => {
  try {
    const history = await getHistory(100000, 'all');
    if (!history || history.length === 0) {
      return res.status(404).json({ error: 'No hay datos en el historial' });
    }

    // Agrupar por día (YYYY-MM-DD en hora local de Venezuela si es posible, o UTC)
    const porDia = {};
    history.forEach(r => {
      // Ajuste simple a UTC-4 (Venezuela)
      const dateObj = new Date(r.created_at);
      // Restar 4 horas para tener el día correcto localmente
      const localDate = new Date(dateObj.getTime() - (4 * 60 * 60 * 1000));
      const day = localDate.toISOString().split('T')[0];
      
      if (!porDia[day]) porDia[day] = [];
      porDia[day].push({ original: r, localDate });
    });

    const datosFiltrados = [];

    // Para cada día, buscar el más cercano a las 9:00 AM y a las 5:00 PM (17:00)
    const targetHours = [9, 17];
    
    Object.keys(porDia).sort().forEach(day => {
      const records = porDia[day];
      
      targetHours.forEach(targetHour => {
        let closest = null;
        let minDiff = Infinity;

        records.forEach(r => {
          const hour = r.localDate.getUTCHours();
          const min = r.localDate.getUTCMinutes();
          const currentDecimal = hour + (min / 60);
          const diff = Math.abs(currentDecimal - targetHour);
          
          if (diff < minDiff) {
            minDiff = diff;
            closest = r.original;
          }
        });

        // Solo agregar si la diferencia es menor a 2.5 horas (para evitar agarrar datos de la madrugada si no hay cercanos)
        if (closest && minDiff < 2.5) {
          // Formatear para Excel
          const local = new Date(new Date(closest.created_at).getTime() - (4 * 60 * 60 * 1000));
          const timeString = local.toISOString().split('T')[1].substring(0, 5);
          
          // Evitar duplicados exactos (a veces el de las 9 y el de las 17 podrían ser el mismo si solo hay 1 dato en el día)
          const isDup = datosFiltrados.find(d => d.created_at === closest.created_at);
          if (!isDup) {
            datosFiltrados.push({
              created_at: closest.created_at, // Oculto o usado para id
              Fecha: day,
              Hora: timeString,
              'USD BCV': closest.usd_bcv,
              'USDT Binance (Compra)': closest.usdt_compra,
              'USDT Binance (Venta)': closest.usdt_venta,
              'Brecha USD/USDT %': closest.brecha_usd_usdt
            });
          }
        }
      });
    });

    // Ordenar cronológicamente descendente o ascendente (dejemos descendente como el history)
    datosFiltrados.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Limpiar el campo interno
    const dataParaExcel = datosFiltrados.map(d => {
      const { created_at, ...resto } = d;
      return resto;
    });

    // Generar Excel
    const xlsx = require('xlsx');
    const ws = xlsx.utils.json_to_sheet(dataParaExcel);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Historial Filtrado");

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="historial_9am_5pm.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (error) {
    console.error('[API /export-excel] Error:', error.message);
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
      // Doble función: mantener el servidor despierto (mediante tráfico externo) 
      // Y guardar datos históricos si Supabase está configurado.
      // Es vital usar 'fetch' hacia la URL externa para que Render detecte actividad.
      const pingUrl = isConfigured() ? `${RENDER_URL}/api/save-rates` : `${RENDER_URL}/api/rates`;
      const method = isConfigured() ? 'POST' : 'GET';
      
      const response = await fetch(pingUrl, { 
        method,
        signal: AbortSignal.timeout(20000) 
      });

      const hora = new Date().toLocaleTimeString('es-VE');
      if (response.ok) {
        console.log(`[Keep-Alive] 💓 Ping externo OK (${method} ${pingUrl}) - ${hora}`);
      } else {
        console.warn(`[Keep-Alive] ⚠️ Ping falló con status ${response.status} - ${hora}`);
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
