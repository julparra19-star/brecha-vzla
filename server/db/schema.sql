-- =============================================================================
-- Schema: Tabla de tasas de cambio históricas
-- Base de datos: Supabase (PostgreSQL)
-- =============================================================================

-- Crear la tabla principal para almacenar el historial de tasas
CREATE TABLE IF NOT EXISTS exchange_rates (
  -- Identificador único del registro
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Fecha y hora de creación automática
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Tasas oficiales del BCV (Banco Central de Venezuela)
  usd_bcv NUMERIC(10, 3),       -- Tasa USD/VES del BCV
  eur_bcv NUMERIC(10, 3),       -- Tasa EUR/VES del BCV

  -- Precios USDT/VES de Binance P2P
  usdt_compra NUMERIC(10, 3),   -- Precio promedio de compra de USDT
  usdt_venta NUMERIC(10, 3),    -- Precio promedio de venta de USDT
  usdt_promedio NUMERIC(10, 3), -- Promedio general de USDT

  -- Brechas calculadas (porcentajes)
  brecha_usd_usdt NUMERIC(8, 3),  -- Brecha entre USD BCV y USDT del mercado
  brecha_eur_usdt NUMERIC(8, 3),  -- Brecha entre EUR BCV y USDT del mercado
  spread_usdt NUMERIC(8, 3)       -- Spread entre compra y venta de USDT
);

-- =============================================================================
-- Seguridad: Row Level Security (RLS)
-- =============================================================================

-- Habilitar RLS en la tabla
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

-- Política de lectura pública: cualquier usuario puede leer los datos
-- Esto permite que el frontend acceda a los datos sin autenticación
CREATE POLICY "Lectura pública de tasas"
  ON exchange_rates
  FOR SELECT
  TO public
  USING (true);

-- Política de inserción: permite al backend insertar datos
-- Funciona tanto con la clave anon como con service_role
CREATE POLICY "Inserción de tasas"
  ON exchange_rates
  FOR INSERT
  TO anon, service_role
  WITH CHECK (true);

-- =============================================================================
-- Índice para optimizar consultas por fecha
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_exchange_rates_created_at
  ON exchange_rates (created_at DESC);

-- =============================================================================
-- Comentarios descriptivos en la tabla
-- =============================================================================
COMMENT ON TABLE exchange_rates IS 'Historial de tasas de cambio BCV y precios Binance P2P con brechas calculadas';
COMMENT ON COLUMN exchange_rates.usd_bcv IS 'Tasa oficial USD/VES del Banco Central de Venezuela';
COMMENT ON COLUMN exchange_rates.eur_bcv IS 'Tasa oficial EUR/VES del Banco Central de Venezuela';
COMMENT ON COLUMN exchange_rates.usdt_compra IS 'Precio promedio de compra USDT/VES en Binance P2P';
COMMENT ON COLUMN exchange_rates.usdt_venta IS 'Precio promedio de venta USDT/VES en Binance P2P';
COMMENT ON COLUMN exchange_rates.usdt_promedio IS 'Promedio general USDT/VES (compra + venta) / 2';
COMMENT ON COLUMN exchange_rates.brecha_usd_usdt IS 'Brecha porcentual entre USDT promedio y USD BCV';
COMMENT ON COLUMN exchange_rates.brecha_eur_usdt IS 'Brecha porcentual entre USDT promedio y EUR BCV';
COMMENT ON COLUMN exchange_rates.spread_usdt IS 'Spread porcentual entre precio de venta y compra de USDT';
