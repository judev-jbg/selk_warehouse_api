// src/utils/scheduler.util.ts
import cron from "node-cron";
import { SupabaseService } from "../services/supabase.service";
import { SyncService } from "../services/sync.service";
import { PrintQueueService } from "../services/print-queue.service";
import { OptimisticUpdateService } from "../services/optimistic-update.service";
import { logger } from "./logger";

const supabaseService = new SupabaseService();

/**
 * Configurar todas las tareas programadas
 */
export const setupScheduledTasks = () => {
  // Logout forzado diario a las 16:00
  cron.schedule(
    "0 16 * * *",
    async () => {
      try {
        logger.info("Ejecutando logout forzado diario a las 16:00");
        await supabaseService.forceDailyLogout();
        logger.info("Logout forzado completado exitosamente");
      } catch (error) {
        logger.error("Error en logout forzado diario:", error);
      }
    },
    {
      timezone: "Europe/Madrid", // Ajustar según la zona horaria de España
    }
  );

  // Limpieza de sesiones expiradas cada hora
  cron.schedule(
    "0 * * * *",
    async () => {
      try {
        logger.info("Ejecutando limpieza de sesiones expiradas");
        await supabaseService.cleanupExpiredSessions();
        logger.info("Limpieza de sesiones completada");
      } catch (error) {
        logger.error("Error en limpieza de sesiones:", error);
      }
    },
    {
      timezone: "Europe/Madrid",
    }
  );

  // Log de estado del sistema cada 6 horas
  cron.schedule(
    "0 */6 * * *",
    async () => {
      try {
        logger.info("Sistema funcionando correctamente", {
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        });
      } catch (error) {
        logger.error("Error en log de estado del sistema:", error);
      }
    },
    {
      timezone: "Europe/Madrid",
    }
  );

  // Sincronización automática con Odoo cada 30 minutos
  cron.schedule(
    "*/30 * * * *",
    async () => {
      try {
        logger.info("Ejecutando sincronización automática con Odoo");

        const syncService = new SyncService();
        const result = await syncService.fullSync(50, {
          strategy: "timestamp",
        });

        logger.info("Sincronización automática completada", {
          success: result.success,
          processed: result.productsProcessed,
          updated: result.productsUpdated,
          failed: result.productsFailed,
          duration: result.duration,
        });
      } catch (error) {
        logger.error("Error en sincronización automática:", error);
      }
    },
    {
      timezone: "Europe/Madrid",
    }
  );

  // Limpieza de trabajos de impresión expirados cada 10 minutos
  cron.schedule(
    "*/10 * * * *",
    async () => {
      try {
        const cleaned = await PrintQueueService.cleanupExpiredJobs();
        if (cleaned > 0) {
          logger.info(`Trabajos de impresión expirados limpiados: ${cleaned}`);
        }
      } catch (error) {
        logger.error("Error limpiando trabajos de impresión expirados:", error);
      }
    },
    {
      timezone: "Europe/Madrid",
    }
  );

  // Limpieza de actualizaciones optimistas cada 5 minutos
  cron.schedule(
    "*/5 * * * *",
    async () => {
      try {
        await OptimisticUpdateService.cleanupExpiredOperations();
      } catch (error) {
        logger.error("Error limpiando actualizaciones optimistas:", error);
      }
    },
    {
      timezone: "Europe/Madrid",
    }
  );

  // Sincronización de conectividad cada hora
  cron.schedule(
    "0 * * * *",
    async () => {
      try {
        const syncService = new SyncService();
        const connectivity = await syncService.checkOdooConnectivity();

        if (!connectivity.isConnected) {
          logger.warn("Pérdida de conectividad con Odoo detectada", {
            error: connectivity.error,
          });
        }
      } catch (error) {
        logger.error("Error verificando conectividad con Odoo:", error);
      }
    },
    {
      timezone: "Europe/Madrid",
    }
  );

  logger.info("Tareas programadas configuradas:");
  logger.info("- Logout forzado diario: 16:00 (CET)");
  logger.info("- Limpieza de sesiones: cada hora");
  logger.info("- Log de estado: cada 6 horas");
  logger.info("- Sincronización automática: cada 30 minutos");
  logger.info("- Limpieza de trabajos de impresión: cada 10 minutos");
  logger.info("- Limpieza de actualizaciones optimistas: cada 5 minutos");
  logger.info("- Verificación de conectividad: cada hora");
};

/**
 * Función para verificar si es hora del logout (útil para testing)
 */
export const checkLogoutTime = (): boolean => {
  const now = new Date();
  return now.getHours() === 16 && now.getMinutes() === 0;
};

/**
 * Función para forzar logout manualmente (útil para testing)
 */
export const forceLogoutNow = async (): Promise<void> => {
  try {
    logger.info("Forzando logout manual");
    await supabaseService.forceDailyLogout();
    logger.info("Logout manual completado");
  } catch (error) {
    logger.error("Error en logout manual:", error);
  }
};
