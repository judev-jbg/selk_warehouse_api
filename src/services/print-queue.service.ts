// src/services/colocacion/print-queue.service.ts
import { redis } from "../config/redis";
import { LabelService } from "./label.service";
import { logger } from "../utils/logger";
import { AppError } from "../middlewares/error.middleware";

interface PrintQueueItem {
  id: string;
  userId: string;
  deviceId: string;
  labelIds: string[];
  priority: "low" | "normal" | "high";
  status: "queued" | "processing" | "completed" | "failed";
  createdAt: Date;
  processedAt?: Date;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
}

interface PrinterStatus {
  id: string;
  name: string;
  isOnline: boolean;
  isPrinting: boolean;
  lastHeartbeat: Date;
  queueLength: number;
}

export class PrintQueueService {
  private static readonly QUEUE_KEY = "print_queue";
  private static readonly PROCESSING_KEY = "print_queue:processing";
  private static readonly PRINTER_STATUS_KEY = "printer_status";
  private static readonly QUEUE_STATS_KEY = "print_queue:stats";
  private static readonly MAX_RETRIES = 3;
  private static readonly PROCESSING_TIMEOUT = 300; // 5 minutos

  /**
   * Agregar trabajo de impresión a la cola
   */
  public static async enqueuePrintJob(
    labelIds: string[],
    userId: string,
    deviceId: string,
    priority: "low" | "normal" | "high" = "normal"
  ): Promise<string> {
    try {
      const jobId = `print_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const queueItem: PrintQueueItem = {
        id: jobId,
        userId,
        deviceId,
        labelIds,
        priority,
        status: "queued",
        createdAt: new Date(),
        retryCount: 0,
        maxRetries: this.MAX_RETRIES,
      };

      // Calcular score para prioridad (mayor score = mayor prioridad)
      const priorityScores = { low: 1, normal: 5, high: 10 };
      const score = priorityScores[priority] * 1000 + Date.now();

      // Agregar a la cola ordenada por prioridad
      await redis.zadd(this.QUEUE_KEY, score, JSON.stringify(queueItem));

      // Actualizar estadísticas
      await this.updateQueueStats("enqueued");

      logger.info(`Trabajo de impresión encolado: ${jobId}`, {
        userId,
        deviceId,
        labelCount: labelIds.length,
        priority,
      });

      return jobId;
    } catch (error) {
      logger.error("Error encolando trabajo de impresión:", error);
      throw new AppError("Error agregando trabajo a la cola de impresión", 500);
    }
  }

  /**
   * Obtener siguiente trabajo de la cola
   */
  public static async dequeueNextJob(): Promise<PrintQueueItem | null> {
    try {
      // Obtener trabajo con mayor prioridad
      const result = await redis.zpopmax(this.QUEUE_KEY);

      if (!result || result.length === 0) {
        return null;
      }

      const queueItem: PrintQueueItem = JSON.parse(result[0]);
      queueItem.status = "processing";
      queueItem.processedAt = new Date();

      // Mover a cola de procesamiento con timeout
      const processingKey = `${this.PROCESSING_KEY}:${queueItem.id}`;
      await redis.setex(
        processingKey,
        this.PROCESSING_TIMEOUT,
        JSON.stringify(queueItem)
      );

      logger.debug(`Trabajo de impresión tomado de la cola: ${queueItem.id}`);

      return queueItem;
    } catch (error) {
      logger.error("Error obteniendo trabajo de la cola:", error);
      return null;
    }
  }

  /**
   * Marcar trabajo como completado
   */
  public static async completeJob(jobId: string): Promise<boolean> {
    try {
      const processingKey = `${this.PROCESSING_KEY}:${jobId}`;
      const jobDataStr = await redis.get(processingKey);

      if (!jobDataStr) {
        logger.warn(`Trabajo no encontrado en procesamiento: ${jobId}`);
        return false;
      }

      const queueItem: PrintQueueItem = JSON.parse(jobDataStr);

      // Marcar etiquetas como impresas
      await LabelService.markLabelsAsPrinted(
        queueItem.labelIds,
        queueItem.userId,
        jobId
      );

      // Eliminar de cola de procesamiento
      await redis.del(processingKey);

      // Actualizar estadísticas
      await this.updateQueueStats("completed");

      logger.info(`Trabajo de impresión completado: ${jobId}`, {
        userId: queueItem.userId,
        labelCount: queueItem.labelIds.length,
      });

      return true;
    } catch (error) {
      logger.error(`Error completando trabajo: ${jobId}`, error);
      return false;
    }
  }

  /**
   * Marcar trabajo como fallido y posiblemente reintentar
   */
  public static async failJob(
    jobId: string,
    errorMessage: string
  ): Promise<boolean> {
    try {
      const processingKey = `${this.PROCESSING_KEY}:${jobId}`;
      const jobDataStr = await redis.get(processingKey);

      if (!jobDataStr) {
        logger.warn(`Trabajo no encontrado en procesamiento: ${jobId}`);
        return false;
      }

      const queueItem: PrintQueueItem = JSON.parse(jobDataStr);
      queueItem.retryCount++;
      queueItem.errorMessage = errorMessage;

      // Si no se han agotado los reintentos, volver a encolar
      if (queueItem.retryCount < queueItem.maxRetries) {
        queueItem.status = "queued";

        // Volver a encolar con prioridad normal
        const score = 5 * 1000 + Date.now();
        await redis.zadd(this.QUEUE_KEY, score, JSON.stringify(queueItem));

        logger.warn(
          `Trabajo reintentado: ${jobId} (intento ${queueItem.retryCount}/${queueItem.maxRetries})`
        );
      } else {
        queueItem.status = "failed";
        logger.error(`Trabajo falló permanentemente: ${jobId}`, {
          errorMessage,
          retryCount: queueItem.retryCount,
        });
      }

      // Eliminar de cola de procesamiento
      await redis.del(processingKey);

      // Actualizar estadísticas
      await this.updateQueueStats(
        queueItem.status === "failed" ? "failed" : "retried"
      );

      return true;
    } catch (error) {
      logger.error(`Error manejando fallo de trabajo: ${jobId}`, error);
      return false;
    }
  }

  /**
   * Obtener estado de la cola
   */
  public static async getQueueStatus(): Promise<{
    queueLength: number;
    processingCount: number;
    stats: {
      enqueued: number;
      completed: number;
      failed: number;
      retried: number;
    };
  }> {
    try {
      const [queueLength, processingKeys, stats] = await Promise.all([
        redis.zcard(this.QUEUE_KEY),
        redis.keys(`${this.PROCESSING_KEY}:*`),
        redis.hmget(
          this.QUEUE_STATS_KEY,
          "enqueued",
          "completed",
          "failed",
          "retried"
        ),
      ]);

      return {
        queueLength,
        processingCount: processingKeys.length,
        stats: {
          enqueued: parseInt(stats[0] || "0"),
          completed: parseInt(stats[1] || "0"),
          failed: parseInt(stats[2] || "0"),
          retried: parseInt(stats[3] || "0"),
        },
      };
    } catch (error) {
      logger.error("Error obteniendo estado de la cola:", error);
      return {
        queueLength: 0,
        processingCount: 0,
        stats: { enqueued: 0, completed: 0, failed: 0, retried: 0 },
      };
    }
  }

  /**
   * Obtener trabajos en cola para un usuario
   */
  public static async getUserQueuedJobs(
    userId: string
  ): Promise<PrintQueueItem[]> {
    try {
      const queueItems = await redis.zrange(this.QUEUE_KEY, 0, -1);

      return queueItems
        .map((item) => JSON.parse(item) as PrintQueueItem)
        .filter((item) => item.userId === userId);
    } catch (error) {
      logger.error(
        `Error obteniendo trabajos en cola para usuario: ${userId}`,
        error
      );
      return [];
    }
  }

  /**
   * Cancelar trabajo de la cola
   */
  public static async cancelJob(
    jobId: string,
    userId: string
  ): Promise<boolean> {
    try {
      // Buscar en cola principal
      const queueItems = await redis.zrange(this.QUEUE_KEY, 0, -1);

      for (const item of queueItems) {
        const queueItem: PrintQueueItem = JSON.parse(item);
        if (queueItem.id === jobId && queueItem.userId === userId) {
          await redis.zrem(this.QUEUE_KEY, item);
          logger.info(`Trabajo cancelado de la cola: ${jobId}`, { userId });
          return true;
        }
      }

      // Buscar en cola de procesamiento
      const processingKey = `${this.PROCESSING_KEY}:${jobId}`;
      const processingItem = await redis.get(processingKey);

      if (processingItem) {
        const queueItem: PrintQueueItem = JSON.parse(processingItem);
        if (queueItem.userId === userId) {
          await redis.del(processingKey);
          logger.info(`Trabajo cancelado de procesamiento: ${jobId}`, {
            userId,
          });
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error(`Error cancelando trabajo: ${jobId}`, error);
      return false;
    }
  }

  /**
   * Limpiar trabajos expirados en procesamiento
   */
  public static async cleanupExpiredJobs(): Promise<number> {
    try {
      const processingKeys = await redis.keys(`${this.PROCESSING_KEY}:*`);
      let cleaned = 0;

      for (const key of processingKeys) {
        const ttl = await redis.ttl(key);

        // Si el TTL es muy bajo o expirado, mover de vuelta a la cola
        if (ttl < 60) {
          // Menos de 1 minuto
          const jobDataStr = await redis.get(key);

          if (jobDataStr) {
            const queueItem: PrintQueueItem = JSON.parse(jobDataStr);

            // Mover de vuelta a la cola si no se han agotado los reintentos
            if (queueItem.retryCount < queueItem.maxRetries) {
              await this.failJob(queueItem.id, "Timeout en procesamiento");
              cleaned++;
            } else {
              await redis.del(key);
              cleaned++;
            }
          }
        }
      }

      if (cleaned > 0) {
        logger.info(`Trabajos expirados limpiados: ${cleaned}`);
      }

      return cleaned;
    } catch (error) {
      logger.error("Error limpiando trabajos expirados:", error);
      return 0;
    }
  }

  /**
   * Actualizar estadísticas de la cola
   */
  private static async updateQueueStats(
    action: "enqueued" | "completed" | "failed" | "retried"
  ): Promise<void> {
    try {
      await redis.hincrby(this.QUEUE_STATS_KEY, action, 1);
    } catch (error) {
      logger.error("Error actualizando estadísticas de la cola:", error);
    }
  }

  /**
   * Resetear estadísticas de la cola
   */
  public static async resetQueueStats(): Promise<void> {
    try {
      await redis.del(this.QUEUE_STATS_KEY);
      logger.info("Estadísticas de la cola reseteadas");
    } catch (error) {
      logger.error("Error reseteando estadísticas de la cola:", error);
    }
  }

  /**
   * Purgar toda la cola (solo para administradores)
   */
  public static async purgeQueue(): Promise<{
    queueCleared: number;
    processingCleared: number;
  }> {
    try {
      const [queueCleared, processingKeys] = await Promise.all([
        redis.del(this.QUEUE_KEY),
        redis.keys(`${this.PROCESSING_KEY}:*`),
      ]);

      let processingCleared = 0;
      if (processingKeys.length > 0) {
        processingCleared = await redis.del(...processingKeys);
      }

      logger.warn("Cola de impresión purgada completamente", {
        queueCleared,
        processingCleared,
      });

      return { queueCleared, processingCleared };
    } catch (error) {
      logger.error("Error purgando cola de impresión:", error);
      return { queueCleared: 0, processingCleared: 0 };
    }
  }
}
