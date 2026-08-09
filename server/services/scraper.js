/**
 * scraper.js
 * Módulo para buscar información sobre intervenciones cambiarias del BCV.
 */

/**
 * Busca noticias recientes sobre intervención cambiaria.
 * Si encuentra datos, retorna un objeto con la información.
 * Si falla, retorna null para no romper el flujo principal.
 * @returns {Promise<{ titular: string, monto: string } | null>}
 */
async function scrapeBCVIntervention() {
  try {
    // Usamos Google News RSS limitado a los últimos 7 días buscando "intervencion cambiaria bcv"
    const url = 'https://news.google.com/rss/search?q=intervencion+cambiaria+BCV+when:7d&hl=es-419&gl=VE&ceid=VE:es-419';
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      console.warn(`[Scraper] HTTP Error: ${response.status}`);
      return null;
    }

    const xml = await response.text();
    
    // Buscar los títulos de los items en el XML
    const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<\/item>/gi;
    let match;
    let bestTitle = null;
    let amountStr = null;

    // Buscar "vendió", "inyectó", "colocó", "intervención" + cifras (ej. "US$ 60 millones")
    while ((match = itemRegex.exec(xml)) !== null) {
      const title = match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim(); // Limpiar CDATA
      
      const isIntervention = /intervenci[oó]n|vendi[oó]|inyect[oó]|coloc[oó]/i.test(title);
      const isBCV = /BCV|Banco Central/i.test(title);
      
      if (isIntervention && isBCV) {
        bestTitle = title;
        // Intentar extraer el monto (ej. "60 millones", "US$ 50 millones")
        const amountMatch = title.match(/(\d+)\s*millones/i);
        if (amountMatch) {
          amountStr = `${amountMatch[1]} millones de dólares`;
        }
        break; // Detener en el primer resultado relevante
      }
    }

    if (bestTitle) {
      return {
        titular: bestTitle.split(' - ')[0], // Quitar el nombre de la fuente al final
        monto: amountStr || 'monto no especificado',
        encontrado: true
      };
    }

    return null;

  } catch (error) {
    console.error('[Scraper] Error interno:', error.message);
    // En caso de error, siempre fallar de forma silenciosa para no romper la app
    return null;
  }
}

module.exports = { scrapeBCVIntervention };
