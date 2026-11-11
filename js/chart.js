/* ============================================
   CHART.JS — Visualizations using Chart.js
   ============================================ */

const ChartModule = (() => {
  let barChartInstance = null;
  let doughnutChartInstance = null;

  // Color palette for charts
  const TYPE_COLORS = {
    water: '#2E86DE',    // Primary Blue
    tea: '#27AE60',      // Fresh Green
    coffee: '#795548',   // Warm Brown
    juice: '#F39C12',    // Citrus Orange
    milk: '#00CEC9',     // Milky Teal
    coconut: '#0984E3'   // Tropical Sky Blue
  };

  /* --- Render Bar Chart: Daily Consumption vs Target --- */
  function renderBarChart(canvasId, days = 7) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (barChartInstance) {
      barChartInstance.destroy();
      barChartInstance = null;
    }

    const data = Storage.getDailyTotals(days);
    const settings = Storage.getSettings();
    const dailyGoal = settings.dailyGoal;

    const labels = data.map(d => {
      // e.g. "Sen, 10 Nov"
      const dateObj = new Date(d.date + 'T00:00:00');
      return dateObj.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' });
    });

    const values = data.map(d => d.total);

    // Color bars: green if goal reached, blue if under goal
    const backgroundColors = values.map(v => (v >= dailyGoal ? '#27AE60' : '#2E86DE'));
    const hoverColors = values.map(v => (v >= dailyGoal ? '#219653' : '#1B6EC2'));

    const ctx = canvas.getContext('2d');
    barChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Konsumsi (ml)',
            data: values,
            backgroundColor: backgroundColors,
            hoverBackgroundColor: hoverColors,
            borderRadius: 8,
            borderSkipped: false,
            maxBarThickness: 36
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: '#1A1D2E',
            padding: 12,
            titleFont: { size: 13, family: 'Inter', weight: '600' },
            bodyFont: { size: 13, family: 'Inter' },
            cornerRadius: 8,
            callbacks: {
              label: function (context) {
                const val = context.raw || 0;
                const pct = Math.round((val / dailyGoal) * 100);
                return ` ${val.toLocaleString('id-ID')} ml (${pct}% dari target)`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              font: { family: 'Inter', size: 12 },
              color: '#7F8C8D'
            }
          },
          y: {
            beginAtZero: true,
            suggestedMax: Math.max(...values, dailyGoal) + 200,
            grid: {
              color: 'rgba(0, 0, 0, 0.05)'
            },
            ticks: {
              font: { family: 'Inter', size: 12 },
              color: '#7F8C8D',
              callback: function (val) {
                return val >= 1000 ? (val / 1000) + ' L' : val + ' ml';
              }
            }
          }
        }
      }
    });
  }

  /* --- Render Doughnut Chart: Beverage Distribution --- */
  function renderDoughnutChart(canvasId, days = 7) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (doughnutChartInstance) {
      doughnutChartInstance.destroy();
      doughnutChartInstance = null;
    }

    const dist = Storage.getDrinkDistribution(days);
    const labels = [];
    const values = [];
    const bgColors = [];

    // Filter only types that have > 0 amount, or fallback if all 0
    let totalAll = 0;
    Object.keys(Storage.DRINK_TYPES).forEach(key => {
      const amount = dist[key] || 0;
      totalAll += amount;
      if (amount > 0) {
        labels.push(Storage.DRINK_TYPES[key].label);
        values.push(amount);
        bgColors.push(TYPE_COLORS[key] || '#74B9FF');
      }
    });

    // If no data, show empty placeholder slice
    const hasData = totalAll > 0;
    const finalLabels = hasData ? labels : ['Belum Ada Data'];
    const finalValues = hasData ? values : [1];
    const finalColors = hasData ? bgColors : ['#E8E2D9'];

    const ctx = canvas.getContext('2d');
    doughnutChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: finalLabels,
        datasets: [
          {
            data: finalValues,
            backgroundColor: finalColors,
            borderWidth: 2,
            borderColor: '#FFFFFF',
            hoverOffset: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font: { family: 'Inter', size: 12 },
              color: '#2C3E50',
              padding: 14,
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            enabled: hasData,
            backgroundColor: '#1A1D2E',
            padding: 12,
            titleFont: { size: 13, family: 'Inter', weight: '600' },
            bodyFont: { size: 13, family: 'Inter' },
            cornerRadius: 8,
            callbacks: {
              label: function (context) {
                const val = context.raw || 0;
                const pct = Math.round((val / totalAll) * 100);
                return ` ${context.label}: ${val.toLocaleString('id-ID')} ml (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  /* --- Initialize all charts on the page --- */
  function initAnalyticsCharts(days = 7) {
    renderBarChart('dailyTrendChart', days);
    renderDoughnutChart('drinkDistributionChart', days);
  }

  /* --- Destroy charts (cleanup) --- */
  function destroyCharts() {
    if (barChartInstance) {
      barChartInstance.destroy();
      barChartInstance = null;
    }
    if (doughnutChartInstance) {
      doughnutChartInstance.destroy();
      doughnutChartInstance = null;
    }
  }

  /* ==================== PUBLIC API ==================== */
  return {
    initAnalyticsCharts,
    renderBarChart,
    renderDoughnutChart,
    destroyCharts
  };
})();
