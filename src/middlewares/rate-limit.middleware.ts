// src/middleware/rate-limit.middleware.ts
import { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis";
import { AppError } from "./error.middleware";
import { logger } from "../utils/logger";

interface RateLimitOptions {
  windowMs: number; // Ventana de tiempo en milisegundos
  max: number; // Máximo número de requests
  message?: string;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

/**
 * Middleware de rate limiting usando Redis
 */
export const createRateLimit = (options: RateLimitOptions) => {
  const {
    windowMs,
    max,
    message = "Demasiadas solicitudes, intente nuevamente más tarde",
    keyGenerator = defaultKeyGenerator,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = keyGenerator(req);
      const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
      const redisKey = `rate_limit:${key}:${windowStart}`;

      // Obtener contador actual
      const current = await redis.get(redisKey);
      const currentCount = current ? parseInt(current) : 0;

      // Verificar si se excede el límite
      if (currentCount >= max) {
        logger.warn(`Rate limit excedido para key: ${key}`, {
          key,
          currentCount,
          max,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        });

        throw new AppError(message, 429);
      }

      // Incrementar contador
      const pipe = redis.pipeline();
      pipe.incr(redisKey);
      pipe.expire(redisKey, Math.ceil(windowMs / 1000));
      await pipe.exec();

      // Agregar headers de rate limit
      res.set({
        "X-RateLimit-Limit": max.toString(),
        "X-RateLimit-Remaining": Math.max(0, max - currentCount - 1).toString(),
        "X-RateLimit-Reset": (windowStart + windowMs).toString(),
      });

      // Middleware para manejar respuestas exitosas/fallidas
      if (skipSuccessfulRequests || skipFailedRequests) {
        const originalSend = res.send;
        res.send = function (data) {
          const statusCode = res.statusCode;
          const shouldSkip =
            (skipSuccessfulRequests && statusCode < 400) ||
            (skipFailedRequests && statusCode >= 400);

          if (shouldSkip) {
            // Decrementar contador si debemos omitir esta respuesta
            redis.decr(redisKey).catch((err) => {
              logger.error("Error decrementando rate limit:", err);
            });
          }

          return originalSend.call(this, data);
        };
      }

      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
      } else {
        logger.error("Error en rate limiting:", error);
        // En caso de error con Redis, permitir la request pero logear el error
        next();
      }
    }
  };
};

/**
 * Generador de key por defecto (IP + User ID si está autenticado)
 */
function defaultKeyGenerator(req: Request): string {
  const userId = req.user?.userId;
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  return userId ? `user:${userId}` : `ip:${ip}`;
}

/**
 * Rate limits específicos para diferentes endpoints
 */

// Rate limit para búsquedas de productos (más restrictivo)
export const searchRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30, // 30 búsquedas por minuto
  message: "Demasiadas búsquedas, espere un momento antes de continuar",
  keyGenerator: (req) => {
    const userId = req.user?.userId || "anonymous";
    return `search:${userId}`;
  },
});

// Rate limit para actualizaciones de productos (menos restrictivo)
export const updateRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 15, // 15 actualizaciones por minuto
  message: "Demasiadas actualizaciones, espere un momento antes de continuar",
  keyGenerator: (req) => {
    const userId = req.user?.userId || "anonymous";
    return `update:${userId}`;
  },
  skipFailedRequests: true, // No contar requests fallidos
});

// Rate limit para operaciones de etiquetas
export const labelRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 20, // 20 operaciones de etiquetas por minuto
  message: "Demasiadas operaciones con etiquetas, espere un momento",
  keyGenerator: (req) => {
    const userId = req.user?.userId || "anonymous";
    return `label:${userId}`;
  },
});

// Rate limit general más permisivo
export const generalRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests por 15 minutos
  message: "Demasiadas solicitudes, intente nuevamente más tarde",
});
