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

  // Crear gradientes para las áreas bajo las líneas
  const gradientUSD = ctx.createLinearGradient(0, 0, 0, 400);
  gradientUSD.addColorStop(0, 'rgba(74, 125, 255, 0.3)');
  gradientUSD.addColorStop(1, 'rgba(74, 125, 255, 0.0)');

  const gradientUSDT = ctx.createLinearGradient(0, 0, 0, 400);
  gradientUSDT.addColorStop(0, 'rgba(6, 182, 212, 0.3)');
  gradientUSDT.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

  _chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [], // Fechas en el eje X
      datasets: [
        {
          label: 'USD BCV (Bs.)',
          data: [],
          borderColor: '#4a7dff',
          backgroundColor: gradientUSD,
          borderWidth: 2.5,
          tension: 0.4,           // Curvas suaves
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#4a7dff',
          pointBorderColor: '#0a0a1a',
          pointBorderWidth: 2,
          order: 2,
        },
        {
          label: 'USDT Promedio (Bs.)',
          data: [],
          borderColor: '#06b6d4',
          backgroundColor: gradientUSDT,
          borderWidth: 2.5,
          tension: 0.4,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#06b6d4',
          pointBorderColor: '#0a0a1a',
          pointBorderWidth: 2,
          order: 1,
        },
        {
          label: 'Brecha USD/USDT (%)',
          data: [],
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: false,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: '#f59e0b',
          pointBorderColor: '#0a0a1a',
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
            color: '#8888bb',
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
          backgroundColor: 'rgba(10, 10, 26, 0.95)',
          titleColor: '#e8e8ff',
          bodyColor: '#8888bb',
          borderColor: 'rgba(255, 255, 255, 0.1)',
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
            color: '#8888bb',
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
            color: '#f59e0b',
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
            color: '#f59e0b',
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

  // Invertir el array para que el gráfico vaya del más antiguo (izquierda) al más reciente (derecha)
  const chartData = [...historyData].reverse();

  // Iterar los registros
  chartData.forEach((record) => {
    // Formatear la fecha para la etiqueta (buscar created_at también)
    const fecha = record.created_at || record.timestamp || record.fecha || '';
    const fechaObj = new Date(fecha);
    const labelText = isNaN(fechaObj.getTime())
      ? fecha
      : fechaObj.toLocaleDateString('es-VE', {
          day: '2-digit',
          month: 'short',
          // Omitimos hora/minuto para que no ocupe tanto espacio en el eje X
        });

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
