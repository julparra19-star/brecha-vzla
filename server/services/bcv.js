// =============================================================================
// Servicio BCV - Banco Central de Venezuela
// Obtiene las tasas oficiales de cambio (USD, EUR) desde la API de dolarvzla
// =============================================================================



// URL de la API que provee las tasas del BCV
const BCV_API_URL = 'https://rates.dolarvzla.com/bcv/current.json';

/**
 * Obtiene las tasas de cambio oficiales del BCV
 * @returns {Promise<{usd: number, eur: number, fecha: string}>}
 * Retorna un objeto con las tasas USD y EUR con 3 decimales, y la fecha
 */
async function fetchBCVRates() {
  try {
    const response = await fetch(BCV_API_URL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`Error HTTP al consultar BCV: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // La API retorna: { current: { date, usd, eur, ... }, ... }
    if (!data || !data.current) {
      throw new Error('Respuesta de la API BCV con formato inesperado');
    }

    const { date, usd, eur } = data.current;

    // Redondear a 3 decimales para consistencia
    return {
      usd: parseFloat(Number(usd).toFixed(3)),
      eur: parseFloat(Number(eur).toFixed(3)),
      fecha: date || new Date().toISOString().split('T')[0],
    };
  } catch (error) {
    console.error('[BCV] Error al obtener tasas:', error.message);
    // Retornar null para indicar que no se pudo obtener la data
    return null;
  }
}

module.exports = { fetchBCVRates };
