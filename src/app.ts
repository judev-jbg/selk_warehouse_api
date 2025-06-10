// src/app.ts (actualizar)
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config/index";
import { errorHandler, notFound } from "./middlewares/error.middleware";
import { logger } from "./utils/logger";
import apiRoutes from "./routes/index";
import { healthCheck } from "./middlewares/health.middleware";

const app = express();

// Middleware de seguridad
app.use(helmet());

// CORS configurado
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://192.168.1.50:3000", // Cambiar por tu IP
      "http://10.0.2.2:3000", // Para emulador Android
      "http://127.0.0.1:3000", // Localhost alternativo
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Device-ID"],
  })
);

// Parsing de JSON
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Logging de requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    deviceId: req.get("Device-ID"),
    timestamp: new Date().toISOString(),
  });
  next();
});

// Health check expandido
app.get("/health", (req, res) => {
  res.json({
    success: true,
    data: {
      status: "OK",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      environment: config.nodeEnv,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      features: {
        authentication: true,
        supabase: true,
        odoo_integration:
          config.nodeEnv === "development" ? "simulated" : "pending",
      },
    },
    message: "SELK Warehouse API funcionando correctamente",
  });
});
app.get("/health/full", healthCheck);

// Rutas API principales
app.use(`/api/${config.apiVersion}`, apiRoutes);

// Ruta raíz informativa
app.get("/", (req, res) => {
  res.json({
    success: true,
    data: {
      name: "SELK Warehouse API",
      version: "1.0.0",
      description: "API Backend para Sistema de Gestión de Almacén SELK",
      endpoints: {
        health: "/health",
        api: `/api/${config.apiVersion}`,
        auth: `/api/${config.apiVersion}/auth`,
        docs: "Próximamente",
      },
    },
    timestamp: new Date().toISOString(),
  });
});

// Middleware de error 404
app.use(notFound);

// Middleware de manejo de errores
app.use(errorHandler);

export default app;
