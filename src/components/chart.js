// ============================================================
// chart.js — Componente de Gráfico para BrechaVzla
// Visualización con Chart.js: USD BCV, USDT Promedio y Brecha
// ============================================================

// Referencia global a la instancia del gráfico
let _chartInstance = null;

/**
 * Inicializa el gráfico multi-dataset en un canvas
 * @param {string} canvasId - ID del elemento canvas
 * @returns {Chart|null} Instancia del gráfico o null si falla
 */
export function initChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.error('[Chart] No se encontró el canvas:', canvasId);
    return null;
  }

  // Destruir instancia previa si existe
  if (_chartInstance) {
    _chartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');

  // Gradiente naranja para USD BCV
  const gradientUSD = ctx.createLinearGradient(0, 0, 0, 400);
  gradientUSD.addColorStop(0, 'rgba(255, 143, 0, 0.28)');
  gradientUSD.addColorStop(1, 'rgba(255, 143, 0, 0.0)');

  // Gradiente azul para USDT
  const gradientUSDT = ctx.createLinearGradient(0, 0, 0, 400);
  gradientUSDT.addColorStop(0, 'rgba(41, 121, 255, 0.22)');
  gradientUSDT.addColorStop(1, 'rgba(41, 121, 255, 0.0)');

  _chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [], // Fechas en el eje X
      datasets: [
        {
          label: 'USD BCV (Bs.)',
          data: [],
          borderColor: '#FF8F00',
          backgroundColor: gradientUSD,
          borderWidth: 2.5,
          tension: 0.4,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#FF8F00',
          pointBorderColor: '#1E1E1E',
          pointBorderWidth: 2,
          order: 2,
        },
        {
          label: 'USDT Promedio (Bs.)',
          data: [],
          borderColor: '#2979FF',
          backgroundColor: gradientUSDT,
          borderWidth: 2.5,
          tension: 0.4,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#2979FF',
          pointBorderColor: '#1E1E1E',
          pointBorderWidth: 2,
          order: 1,
        },
        {
          label: 'Brecha USD/USDT (%)',
          data: [],
          borderColor: '#FFD600',
          backgroundColor: 'rgba(255, 214, 0, 0.08)',
          borderWidth: 2,
          tension: 0.4,
          fill: false,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: '#FFD600',
          pointBorderColor: '#1E1E1E',
          pointBorderWidth: 2,
          borderDash: [5, 5],     // Línea punteada para la brecha
          yAxisID: 'y1',          // Eje Y secundario
          order: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#A0A0A0',
            font: {
              family: 'Inter',
              size: 12,
              weight: '500',
            },
            padding: 20,
            usePointStyle: true,
            pointStyle: 'circle',
          },
        },
        tooltip: {
          backgroundColor: 'rgba(20, 20, 20, 0.97)',
          titleColor: '#E0E0E0',
          bodyColor: '#A0A0A0',
          borderColor: '#2C2C2C',
          borderWidth: 1,
          cornerRadius: 12,
          padding: 14,
          titleFont: {
            family: 'Outfit',
            size: 14,
            weight: '600',
          },
          bodyFont: {
            family: 'Inter',
            size: 13,
          },
          displayColors: true,
          callbacks: {
            // Formatear los valores en el tooltip
            label: function(context) {
              const label = context.dataset.label || '';
              const value = context.parsed.y;

              if (label.includes('%')) {
                return ` ${label}: ${value.toFixed(3)}%`;
              }
              return ` ${label}: Bs. ${value.toFixed(3)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.04)',
            drawBorder: false,
          },
          ticks: {
            color: '#A0A0A0',
            font: {
              family: 'Inter',
              size: 11,
            },
            maxRotation: 45,
            maxTicksLimit: 10,
          },
        },
        y: {
          position: 'left',
          grid: {
            color: 'rgba(255, 255, 255, 0.04)',
            drawBorder: false,
          },
          ticks: {
            color: '#8888bb',
            font: {
              family: 'Inter',
              size: 11,
            },
            callback: function(value) {
              return 'Bs. ' + value.toFixed(2);
            },
          },
          title: {
            display: true,
            text: 'Bolívares (Bs.)',
            color: '#8888bb',
            font: {
              family: 'Inter',
              size: 12,
            },
          },
        },
        y1: {
          position: 'right',
          grid: {
            drawOnChartArea: false, // No superponer líneas con el eje primario
          },
          ticks: {
            color: '#FFD600',
            font: {
              family: 'Inter',
              size: 11,
            },
            callback: function(value) {
              return value.toFixed(1) + '%';
            },
          },
          title: {
            display: true,
            text: 'Brecha (%)',
            color: '#FFD600',
            font: {
              family: 'Inter',
              size: 12,
            },
          },
        },
      },
      // Animación de entrada
      animation: {
        duration: 1000,
        easing: 'easeInOutQuart',
      },
    },
  });

  return _chartInstance;
}

/**
 * Actualiza el gráfico con nuevos datos históricos
 * @param {Array} historyData - Array de registros históricos del endpoint /api/history
 */
export function updateChart(historyData) {
  if (!_chartInstance) {
    console.warn('[Chart] El gráfico no ha sido inicializado');
    return;
  }

  if (!Array.isArray(historyData) || historyData.length === 0) {
    console.warn('[Chart] No hay datos históricos para graficar');
    return;
  }

  // Extraer etiquetas (fechas) y datasets
  const labels = [];
  const usdBcvData = [];
  const usdtPromedioData = [];
  const brechaUsdData = [];

  // --------------------------------------------------------------------------
  // Lógica de Agrupación (para suavizar el gráfico en Semana y Mes)
  // --------------------------------------------------------------------------
  // Invertir el array para que el gráfico vaya del más antiguo (izquierda) al más reciente
  let chartData = [...historyData].reverse();

  // Determinar el rango de tiempo
  const tOldest = new Date(chartData[0].created_at || chartData[0].timestamp || chartData[0].fecha).getTime();
  const tNewest = new Date(chartData[chartData.length - 1].created_at || chartData[chartData.length - 1].timestamp || chartData[chartData.length - 1].fecha).getTime();
  
  const spanHours = (tNewest - tOldest) / (1000 * 60 * 60);

  // Si el rango es mayor a 48 horas, agrupamos por DÍA
  if (spanHours > 48) {
    const grouped = {};
    chartData.forEach(record => {
      const d = new Date(record.created_at || record.timestamp || record.fecha);
      if (isNaN(d.getTime())) return;
      
      const dateKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      if (!grouped[dateKey]) {
        grouped[dateKey] = {
          count: 0,
          dateObj: d, // Guardar objeto Date representativo
          usd_bcv: 0,
          usdt_promedio: 0,
          brecha_usd: 0
        };
      }
      
      const g = grouped[dateKey];
      g.count++;
      
      // BCV
      if (record.bcv) g.usd_bcv += parseFloat(record.bcv.usd) || 0;
      else g.usd_bcv += parseFloat(record.usd_bcv) || parseFloat(record.usd) || 0;
      
      // Binance
      if (record.binance) g.usdt_promedio += parseFloat(record.binance.promedio) || 0;
      else g.usdt_promedio += parseFloat(record.usdt_promedio) || parseFloat(record.promedio) || 0;
      
      // Brecha
      if (record.brechas) g.brecha_usd += parseFloat(record.brechas.brecha_usd_usdt) || 0;
      else g.brecha_usd += parseFloat(record.brecha_usd_usdt) || parseFloat(record.brecha_usd) || 0;
    });

    // Convertir de vuelta a array de registros promediados
    chartData = Object.values(grouped).map(g => ({
      created_at: g.dateObj.toISOString(),
      usd_bcv: g.usd_bcv / g.count,
      usdt_promedio: g.usdt_promedio / g.count,
      brecha_usd_usdt: g.brecha_usd / g.count
    })).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  // Iterar los registros listos para graficar
  chartData.forEach((record) => {
    // Formatear la fecha para la etiqueta
    const fecha = record.created_at || record.timestamp || record.fecha || '';
    const fechaObj = new Date(fecha);
    
    // Si estamos en un rango <= 48 horas (ej. Hoy), mostramos también la hora
    const labelText = isNaN(fechaObj.getTime())
      ? fecha
      : spanHours <= 48 
        ? fechaObj.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
        : fechaObj.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });

    labels.push(labelText);

    // Extraer valores — manejar estructura plana o anidada
    if (record.bcv) {
      usdBcvData.push(parseFloat(record.bcv.usd) || 0);
    } else {
      usdBcvData.push(parseFloat(record.usd_bcv) || parseFloat(record.usd) || 0);
    }

    if (record.binance) {
      usdtPromedioData.push(parseFloat(record.binance.promedio) || 0);
    } else {
      usdtPromedioData.push(parseFloat(record.usdt_promedio) || parseFloat(record.promedio) || 0);
    }

    if (record.brechas) {
      brechaUsdData.push(parseFloat(record.brechas.brecha_usd_usdt) || 0);
    } else {
      brechaUsdData.push(parseFloat(record.brecha_usd_usdt) || parseFloat(record.brecha_usd) || 0);
    }
  });

  // Actualizar datos del gráfico
  _chartInstance.data.labels = labels;
  _chartInstance.data.datasets[0].data = usdBcvData;
  _chartInstance.data.datasets[1].data = usdtPromedioData;
  _chartInstance.data.datasets[2].data = brechaUsdData;

  // Re-renderizar con animación
  _chartInstance.update('active');
}

/**
 * Destruye la instancia del gráfico (limpieza)
 */
export function destroyChart() {
  if (_chartInstance) {
    _chartInstance.destroy();
    _chartInstance = null;
  }
}
