# 🇻🇪 BrechaVzla - Monitor de Brechas Cambiarias

[![Made with Vite](https://img.shields.io/badge/Made%20with-Vite-646CFF?logo=vite)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Database-Supabase-3ECF8E?logo=supabase)](https://supabase.com/)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa)](https://web.dev/progressive-web-apps/)

Aplicación Progressive Web App (PWA) que monitorea en tiempo real las brechas cambiarias entre las tasas oficiales del **Banco Central de Venezuela (BCV)** y los precios P2P de **Binance** (USDT/VES).

## 📊 Características

- **Tasas BCV en tiempo real**: Dólar y Euro oficial con 3 decimales
- **Precios Binance P2P**: Compra, venta y promedio de USDT/VES
- **Cálculo de brechas**: USD vs USDT, EUR vs USDT, Spread compra/venta
- **Alertas automáticas**: Notificaciones 3 veces al día (9:00, 12:00, 18:00)
- **Historial de datos**: Almacenamiento en Supabase (PostgreSQL)
- **Gráficos interactivos**: Visualización con Chart.js
- **PWA instalable**: Funciona como app nativa en tu teléfono
- **Diseño premium**: Dark mode con glassmorphism y animaciones

## 🚀 Instalación

### Prerrequisitos

- [Node.js](https://nodejs.org/) v18 o superior
- Cuenta gratuita en [Supabase](https://supabase.com/) (opcional, para historial)

### Pasos

1. **Clonar el repositorio**
```bash
git clone https://github.com/tu-usuario/brecha-vzla.git
cd brecha-vzla
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
```bash
cp .env.example .env
```
Edita `.env` con tus credenciales de Supabase (ver sección Supabase abajo).

4. **Iniciar el servidor de desarrollo**
```bash
# Terminal 1: Backend Express
npm run server

# Terminal 2: Frontend Vite
npm run dev
```

5. **Abrir en el navegador**
```
http://localhost:5173
```

## 🗄️ Configuración de Supabase

1. Crea una cuenta gratuita en [supabase.com](https://supabase.com)
2. Crea un nuevo proyecto
3. Ve a **SQL Editor** y ejecuta el contenido de `server/db/schema.sql`
4. Ve a **Project Settings > API** y copia:
   - `Project URL` → `SUPABASE_URL` en tu `.env`
   - `anon public key` → `SUPABASE_KEY` en tu `.env`

## 📱 Instalar como App (PWA)

### Android (Chrome)
1. Abre la app en Chrome
2. Toca el menú (⋮) → "Agregar a pantalla de inicio"
3. Confirma la instalación

### iPhone (Safari)
1. Abre la app en Safari
2. Toca el botón compartir (↑) → "Agregar a pantalla de inicio"
3. Confirma la instalación

## 🏗️ Estructura del Proyecto

```
brecha-vzla/
├── server/                   # Backend Express
│   ├── index.js              # Servidor principal + cron jobs
│   ├── services/
│   │   ├── bcv.js            # Servicio API BCV (DolarVzla)
│   │   ├── binance.js        # Servicio Binance P2P
│   │   ├── calculator.js     # Cálculo de brechas
│   │   └── supabase.js       # Cliente Supabase
│   └── db/
│       └── schema.sql        # Schema de la base de datos
├── src/                      # Frontend
│   ├── main.js               # Lógica principal
│   ├── styles/
│   │   └── main.css          # Estilos premium
│   ├── services/
│   │   ├── api.js            # Cliente API
│   │   └── notifications.js  # Sistema de notificaciones
│   └── components/
│       ├── dashboard.js      # Componentes del dashboard
│       └── chart.js          # Gráficos Chart.js
├── public/                   # Assets estáticos
│   └── icons/                # Iconos PWA
├── index.html                # HTML principal
├── vite.config.js            # Configuración Vite + PWA
├── package.json
├── .env.example
└── .gitignore
```

## 📐 Fórmulas de Brecha

| Métrica | Fórmula |
|---------|---------|
| Brecha USD/USDT | `((USDT_promedio - USD_BCV) / USD_BCV) × 100` |
| Brecha EUR/USDT | `((USDT_promedio - EUR_BCV) / EUR_BCV) × 100` |
| Spread USDT | `((USDT_venta - USDT_compra) / USDT_compra) × 100` |

## 🔔 Alertas

La app envía notificaciones push 3 veces al día:
- ☀️ **9:00 AM** - Tasas de apertura
- 🌤️ **12:00 PM** - Actualización de mediodía
- 🌙 **6:00 PM** - Cierre del día

## ⚠️ Notas Importantes

- La API de Binance P2P es **no oficial** y puede cambiar sin previo aviso
- Las tasas del BCV se actualizan una vez al día
- Se recomienda no hacer más de 1 consulta por minuto a Binance P2P
- La app funciona sin Supabase (solo datos en tiempo real, sin historial)

## 📄 Licencia

MIT © 2026
