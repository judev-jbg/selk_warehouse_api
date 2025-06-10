// src/middleware/search-timeout.middleware.ts
import { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis";
import { logger } from "../utils/logger";

interface SearchThrottleOptions {
  windowMs: number; // Ventana de tiempo para agrupar búsquedas
  debounceMs: number; // Tiempo de debounce entre búsquedas
  maxPendingSearches: number; // Máximo número de búsquedas pendientes
}

/**
 * Middleware para manejar timeout y debounce de búsquedas automáticas
 */
export const createSearchThrottle = (options: SearchThrottleOptions) => {
  const { windowMs, debounceMs, maxPendingSearches } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const deviceId = req.deviceId;
      const { barcode } = req.params;

      if (!userId || !deviceId || !barcode) {
        return next();
      }

      const searchKey = `search_throttle:${userId}:${deviceId}`;
      const pendingKey = `search_pending:${userId}:${deviceId}`;
      const lastSearchKey = `last_search:${userId}:${deviceId}`;

      // Verificar si hay demasiadas búsquedas pendientes
      const pendingCount = await redis.get(pendingKey);
      if (pendingCount && parseInt(pendingCount) >= maxPendingSearches) {
        logger.warn(`Demasiadas búsquedas pendientes para usuario ${userId}`, {
          pendingCount: parseInt(pendingCount),
          maxPendingSearches,
          barcode,
        });

        return res.status(429).json({
          success: false,
          error: "Demasiadas búsquedas pendientes",
          message:
            "Espere a que terminen las búsquedas anteriores antes de continuar",
          timestamp: new Date().toISOString(),
        });
      }

      // Verificar debounce - si la última búsqueda fue muy reciente
      const lastSearchTime = await redis.get(lastSearchKey);
      if (lastSearchTime) {
        const timeSinceLastSearch = Date.now() - parseInt(lastSearchTime);
        if (timeSinceLastSearch < debounceMs) {
          logger.debug(`Búsqueda ignorada por debounce: ${barcode}`, {
            userId,
            deviceId,
            timeSinceLastSearch,
            debounceMs,
          });

          return res.status(429).json({
            success: false,
            error: "Búsqueda demasiado frecuente",
            message: `Espere ${Math.ceil(
              (debounceMs - timeSinceLastSearch) / 1000
            )} segundos antes de realizar otra búsqueda`,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Incrementar contador de búsquedas pendientes
      const pipe = redis.pipeline();
      pipe.incr(pendingKey);
      pipe.expire(pendingKey, Math.ceil(windowMs / 1000));
      pipe.set(lastSearchKey, Date.now().toString());
      pipe.expire(lastSearchKey, Math.ceil(debounceMs / 1000));
      await pipe.exec();

      // Middleware para decrementar contador al finalizar
      const originalSend = res.send;
      res.send = function (data) {
        // Decrementar contador de búsquedas pendientes
        redis.decr(pendingKey).catch((err) => {
          logger.error("Error decrementando búsquedas pendientes:", err);
        });

        return originalSend.call(this, data);
      };

      next();
    } catch (error) {
      logger.error("Error en search throttle middleware:", error);
      // En caso de error, permitir la búsqueda
      next();
    }
  };
};

/**
 * Configuración específica para búsquedas de productos
 */
export const productSearchThrottle = createSearchThrottle({
  windowMs: 30 * 1000, // 30 segundos
  debounceMs: 1000, // 1 segundo entre búsquedas
  maxPendingSearches: 3, // Máximo 3 búsquedas simultáneas
});
