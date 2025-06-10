// src/middleware/health.middleware.ts
import { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis";
import { SyncService } from "../services/sync.service";
import { logger } from "../utils/logger";

interface HealthCheck {
  service: string;
  status: "healthy" | "unhealthy" | "degraded";
  responseTime?: number;
  error?: string;
  details?: any;
}

interface SystemHealth {
  overall: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  uptime: number;
  checks: HealthCheck[];
  version: string;
  environment: string;
}

/**
 * Middleware para verificar salud del sistema
 */
export const healthCheck = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const checks: HealthCheck[] = [];
    let overallStatus: "healthy" | "unhealthy" | "degraded" = "healthy";

    // Verificar Redis
    const redisCheck = await checkRedisHealth();
    checks.push(redisCheck);
    if (redisCheck.status === "unhealthy") overallStatus = "unhealthy";
    else if (redisCheck.status === "degraded" && overallStatus === "healthy")
      overallStatus = "degraded";

    // Verificar Odoo (solo si se solicita check completo)
    if (req.query.full === "true") {
      const odooCheck = await checkOdooHealth();
      checks.push(odooCheck);
      if (odooCheck.status === "unhealthy") overallStatus = "unhealthy";
      else if (odooCheck.status === "degraded" && overallStatus === "healthy")
        overallStatus = "degraded";
    }

    // Verificar memoria y recursos
    const systemCheck = checkSystemResources();
    checks.push(systemCheck);
    if (systemCheck.status === "degraded" && overallStatus === "healthy")
      overallStatus = "degraded";

    const health: SystemHealth = {
      overall: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks,
      version: "1.0.0",
      environment: process.env.NODE_ENV || "development",
    };

    const statusCode =
      overallStatus === "healthy"
        ? 200
        : overallStatus === "degraded"
        ? 200
        : 503;

    res.status(statusCode).json({
      success: overallStatus !== "unhealthy",
      data: health,
      message: `Sistema ${overallStatus}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error en health check:", error);

    res.status(503).json({
      success: false,
      data: {
        overall: "unhealthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks: [
          {
            service: "health-check",
            status: "unhealthy",
            error: "Error interno en verificación de salud",
          },
        ],
        version: "1.0.0",
        environment: process.env.NODE_ENV || "development",
      },
      error: "Error interno en verificación de salud",
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Verificar salud de Redis
 */
async function checkRedisHealth(): Promise<HealthCheck> {
  const startTime = Date.now();

  try {
    await redis.ping();
    const responseTime = Date.now() - startTime;

    return {
      service: "redis",
      status: responseTime < 100 ? "healthy" : "degraded",
      responseTime,
      details: {
        connected: true,
      },
    };
  } catch (error) {
    return {
      service: "redis",
      status: "unhealthy",
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Error de conexión",
      details: {
        connected: false,
      },
    };
  }
}

/**
 * Verificar salud de Odoo
 */
async function checkOdooHealth(): Promise<HealthCheck> {
  const startTime = Date.now();

  try {
    const syncService = new SyncService();
    const connectivity = await syncService.checkOdooConnectivity();
    const responseTime = Date.now() - startTime;

    return {
      service: "odoo",
      status: connectivity.isConnected
        ? responseTime < 5000
          ? "healthy"
          : "degraded"
        : "unhealthy",
      responseTime,
      error: connectivity.error,
      details: {
        connected: connectivity.isConnected,
        systemInfo: connectivity.systemInfo,
      },
    };
  } catch (error) {
    return {
      service: "odoo",
      status: "unhealthy",
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Error de conexión",
      details: {
        connected: false,
      },
    };
  }
}

/**
 * Verificar recursos del sistema
 */
function checkSystemResources(): HealthCheck {
  try {
    const memoryUsage = process.memoryUsage();
    const memoryUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    const memoryTotalMB = memoryUsage.heapTotal / 1024 / 1024;
    const memoryUsagePercentage = (memoryUsedMB / memoryTotalMB) * 100;

    const status = memoryUsagePercentage > 90 ? "degraded" : "healthy";

    return {
      service: "system",
      status,
      details: {
        memory: {
          used: `${memoryUsedMB.toFixed(2)} MB`,
          total: `${memoryTotalMB.toFixed(2)} MB`,
          percentage: `${memoryUsagePercentage.toFixed(2)}%`,
        },
        uptime: process.uptime(),
        platform: process.platform,
        nodeVersion: process.version,
      },
    };
  } catch (error) {
    return {
      service: "system",
      status: "unhealthy",
      error: "Error obteniendo información del sistema",
    };
  }
}
