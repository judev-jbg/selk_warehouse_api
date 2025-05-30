// src/utils/scheduler.util.ts
import cron from "node-cron";
import { SupabaseService } from "../services/supabase.service";
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

  logger.info("Tareas programadas configuradas:");
  logger.info("- Logout forzado diario: 16:00 (CET)");
  logger.info("- Limpieza de sesiones: cada hora");
  logger.info("- Log de estado: cada 6 horas");
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
