// src/app.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config";
import { errorHandler, notFound } from "./middlewares/error.middleware";
import { logger } from "./utils/logger";

const app = express();

// Middleware de seguridad
app.use(helmet());

// CORS configurado
app.use(
  cors({
    origin: config.cors.allowedOrigins,
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
    timestamp: new Date().toISOString(),
  });
  next();
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    success: true,
    data: {
      status: "OK",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      environment: config.nodeEnv,
    },
  });
});

// Rutas API (las agregaremos en el siguiente hito)
app.use(`/api/${config.apiVersion}`, (req, res, next) => {
  res.json({
    success: true,
    message: "SELK Warehouse API está funcionando correctamente",
    timestamp: new Date().toISOString(),
  });
});

// Middleware de error 404
app.use(notFound);

// Middleware de manejo de errores
app.use(errorHandler);

export default app;
