// src/controllers/colocacion/label.controller.ts
import { Request, Response, NextFunction } from "express";
import { LabelService } from "../../services/label.service";
import { PrintQueueService } from "../../services/print-queue.service";
import { ApiResponse } from "../../types/common.types";
import { logger } from "../../utils/logger";
import { AppError } from "../../middlewares/error.middleware";

export class LabelController {
  /**
   * GET /api/v1/colocacion/labels/pending
   * Obtener etiquetas pendientes de impresión
   */
  public getPendingLabels = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const userId = req.user!.userId;
      const deviceId = req.query.deviceId as string;

      const labels = await LabelService.getPendingLabels(userId, deviceId);

      res.status(200).json({
        success: true,
        data: {
          labels: labels.map((label) => ({
            id: label.id,
            productId: label.product_id,
            barcode: label.barcode,
            reference: label.reference,
            description: label.description,
            location: label.location,
            createdAt: label.created_at,
            deviceIdentifier: label.device_identifier,
          })),
          count: labels.length,
        },
        message: `${labels.length} etiquetas pendientes encontradas`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error obteniendo etiquetas pendientes:", error);
      next(error);
    }
  };

  /**
   * POST /api/v1/colocacion/labels/create
   * Crear etiqueta para un producto específico
   */
  public createLabel = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const { productId } = req.body;
      const userId = req.user!.userId;
      const deviceId = req.deviceId!;
      const ipAddress = req.ip || req.connection.remoteAddress || "unknown";

      if (!productId) {
        throw new AppError("ID del producto requerido", 400);
      }

      const label = await LabelService.createOrUpdateLabel(
        productId,
        userId,
        deviceId,
        ipAddress
      );

      res.status(201).json({
        success: true,
        data: {
          label: {
            id: label.id,
            productId: label.product_id,
            barcode: label.barcode,
            reference: label.reference,
            description: label.description,
            location: label.location,
            createdAt: label.created_at,
          },
        },
        message: "Etiqueta creada correctamente",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error creando etiqueta:", error);
      next(error);
    }
  };

  /**
   * DELETE /api/v1/colocacion/labels
   * Eliminar etiquetas específicas
   */
  public deleteLabels = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const { labelIds } = req.body;
      const userId = req.user!.userId;
      const deviceId = req.deviceId!;
      const ipAddress = req.ip || req.connection.remoteAddress || "unknown";

      if (!labelIds || !Array.isArray(labelIds) || labelIds.length === 0) {
        throw new AppError("IDs de etiquetas requeridos", 400);
      }

      const result = await LabelService.deleteLabels(
        labelIds,
        userId,
        deviceId,
        ipAddress
      );

      const statusCode = result.errors.length > 0 ? 207 : 200; // 207 Multi-Status

      res.status(statusCode).json({
        success: result.deleted > 0,
        data: {
          deleted: result.deleted,
          errors: result.errors,
          total: labelIds.length,
        },
        message: `${result.deleted} etiquetas eliminadas de ${labelIds.length}`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error eliminando etiquetas:", error);
      next(error);
    }
  };

  /**
   * POST /api/v1/colocacion/labels/print
   * Enviar etiquetas a la cola de impresión
   */
  public printLabels = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const { labelIds, priority = "normal" } = req.body;
      const userId = req.user!.userId;
      const deviceId = req.deviceId!;

      if (!labelIds || !Array.isArray(labelIds) || labelIds.length === 0) {
        throw new AppError("IDs de etiquetas requeridos", 400);
      }

      if (labelIds.length > 50) {
        throw new AppError("Máximo 50 etiquetas por trabajo de impresión", 400);
      }

      // Crear trabajo de impresión
      const printJob = await LabelService.createPrintJob(
        labelIds,
        userId,
        deviceId
      );

      // Encolar para impresión
      const jobId = await PrintQueueService.enqueuePrintJob(
        labelIds,
        userId,
        deviceId,
        priority
      );

      res.status(200).json({
        success: true,
        data: {
          printJob: {
            id: printJob.id,
            jobId,
            labelCount: labelIds.length,
            status: printJob.status,
            priority,
            createdAt: printJob.createdAt,
          },
        },
        message: `${labelIds.length} etiquetas enviadas a impresión`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error enviando etiquetas a impresión:", error);
      next(error);
    }
  };

  /**
   * GET /api/v1/colocacion/labels/:id/preview
   * Obtener vista previa de una etiqueta en formato DYMO
   */
  public getLabelPreview = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      // Obtener etiqueta
      const labels = await LabelService.getPendingLabels(userId);
      const label = labels.find((l) => l.id === id);

      if (!label) {
        throw new AppError("Etiqueta no encontrada", 404);
      }

      // Generar formato DYMO
      const dymoFormat = LabelService.generateDymoFormat({
        reference: label.reference,
        description: label.description,
        location: label.location,
        barcode: label.barcode,
      });

      res.status(200).json({
        success: true,
        data: {
          label: {
            id: label.id,
            reference: label.reference,
            description: label.description,
            location: label.location,
            barcode: label.barcode,
          },
          dymoFormat,
        },
        message: "Vista previa de etiqueta generada",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error generando vista previa:", error);
      next(error);
    }
  };

  /**
   * POST /api/v1/colocacion/labels/batch-preview
   * Obtener vista previa de múltiples etiquetas para impresión en lote
   */
  public getBatchPreview = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const { labelIds } = req.body;
      const userId = req.user!.userId;

      if (!labelIds || !Array.isArray(labelIds) || labelIds.length === 0) {
        throw new AppError("IDs de etiquetas requeridos", 400);
      }

      // Generar formatos DYMO para todas las etiquetas
      const dymoFormats = await LabelService.generateBatchDymoFormat(
        labelIds,
        userId
      );

      res.status(200).json({
        success: true,
        data: {
          dymoFormats,
          count: dymoFormats.length,
        },
        message: `Vista previa de ${dymoFormats.length} etiquetas generada`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error generando vista previa en lote:", error);
      next(error);
    }
  };

  /**
   * GET /api/v1/colocacion/labels/stats
   * Obtener estadísticas de etiquetas del usuario
   */
  public getLabelStats = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const userId = req.user!.userId;

      const stats = await LabelService.getLabelStats(userId);

      res.status(200).json({
        success: true,
        data: stats,
        message: "Estadísticas de etiquetas obtenidas",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error obteniendo estadísticas de etiquetas:", error);
      next(error);
    }
  };

  /**
   * GET /api/v1/colocacion/labels/print-queue/status
   * Obtener estado de la cola de impresión
   */
  public getPrintQueueStatus = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const userId = req.user!.userId;

      const [queueStatus, userJobs] = await Promise.all([
        PrintQueueService.getQueueStatus(),
        PrintQueueService.getUserQueuedJobs(userId),
      ]);

      res.status(200).json({
        success: true,
        data: {
          ...queueStatus,
          userJobs: userJobs.map((job) => ({
            id: job.id,
            labelCount: job.labelIds.length,
            priority: job.priority,
            status: job.status,
            createdAt: job.createdAt,
            retryCount: job.retryCount,
            errorMessage: job.errorMessage,
          })),
        },
        message: "Estado de la cola de impresión obtenido",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error obteniendo estado de la cola:", error);
      next(error);
    }
  };

  /**
   * DELETE /api/v1/colocacion/labels/print-queue/:jobId
   * Cancelar trabajo de impresión
   */
  public cancelPrintJob = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const { jobId } = req.params;
      const userId = req.user!.userId;

      const cancelled = await PrintQueueService.cancelJob(jobId, userId);

      if (!cancelled) {
        throw new AppError(
          "Trabajo de impresión no encontrado o sin permisos",
          404
        );
      }

      res.status(200).json({
        success: true,
        message: "Trabajo de impresión cancelado",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error cancelando trabajo de impresión:", error);
      next(error);
    }
  };

  /**
   * DELETE /api/v1/colocacion/labels/cleanup
   * Limpiar etiquetas antiguas impresas (solo administradores)
   */
  public cleanupOldLabels = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const { daysOld = 30 } = req.query;

      const deletedCount = await LabelService.cleanupOldPrintedLabels(
        parseInt(daysOld as string)
      );

      res.status(200).json({
        success: true,
        data: {
          deletedCount,
          daysOld: parseInt(daysOld as string),
        },
        message: `${deletedCount} etiquetas antiguas eliminadas`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error limpiando etiquetas antiguas:", error);
      next(error);
    }
  };
}
