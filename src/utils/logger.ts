// src/utils/logger.util.ts
import winston from "winston";

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  transports: [
    // Consola para desarrollo
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),

    // Archivo para producción
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
    }),
    new winston.transports.File({
      filename: "logs/combined.log",
    }),
  ],
});

// Función para crear logs de auditoría específicos
export const auditLogger = {
  login: (userId: string, deviceId: string, ip: string) => {
    logger.info("User login", {
      type: "audit",
      action: "login",
      userId,
      deviceId,
      ip,
      timestamp: new Date().toISOString(),
    });
  },

  logout: (userId: string, deviceId: string) => {
    logger.info("User logout", {
      type: "audit",
      action: "logout",
      userId,
      deviceId,
      timestamp: new Date().toISOString(),
    });
  },

  accessModule: (userId: string, module: string, deviceId: string) => {
    logger.info("Module access", {
      type: "audit",
      action: "access_module",
      userId,
      module,
      deviceId,
      timestamp: new Date().toISOString(),
    });
  },
};
