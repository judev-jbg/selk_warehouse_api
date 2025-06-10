// src/services/colocacion/label.service.ts
import { Op } from "sequelize";
import ProductLabel from "../models/ProductLabel";
import Product from "../models/Product";
import { auditLogger } from "../utils/audit-logger";
import { logger } from "../utils/logger";
import { AppError } from "../middlewares/error.middleware";

interface LabelData {
  reference: string;
  description: string;
  location: string;
  barcode: string;
}

interface DymoLabelFormat {
  width: number; // 28mm
  height: number; // 89mm
  elements: Array<{
    type: "text" | "barcode";
    content: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    fontSize?: number;
    fontWeight?: "normal" | "bold";
    alignment?: "left" | "center" | "right";
  }>;
}

interface LabelPrintJob {
  id: string;
  labelIds: string[];
  userId: string;
  deviceId: string;
  status: "pending" | "printing" | "completed" | "failed";
  createdAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

export class LabelService {
  /**
   * Crear o actualizar etiqueta para un producto
   */
  public static async createOrUpdateLabel(
    productId: string,
    userId: string,
    deviceId: string,
    ipAddress?: string
  ): Promise<ProductLabel> {
    try {
      // Obtener producto
      const product = await Product.findByPk(productId);
      if (!product) {
        throw new AppError("Producto no encontrado", 404);
      }

      if (!product.location) {
        throw new AppError(
          "El producto debe tener una ubicación para generar etiqueta",
          400
        );
      }

      // Buscar etiqueta existente para este producto y usuario
      let label = await ProductLabel.findOne({
        where: {
          product_id: productId,
          created_by: userId,
        },
      });

      const isUpdate = label !== null;

      if (label) {
        // Actualizar etiqueta existente
        label.barcode = product.barcode;
        label.reference = product.reference;
        label.description = product.description;
        label.location = product.location;
        label.device_identifier = deviceId;
        label.is_printed = false; // Resetear estado de impresión
        label.printed_at = null;

        await label.save();

        logger.debug(`Etiqueta actualizada: ${label.id}`, {
          productId,
          userId,
          reference: product.reference,
        });
      } else {
        // Crear nueva etiqueta
        label = await ProductLabel.create({
          product_id: productId,
          barcode: product.barcode,
          reference: product.reference,
          description: product.description,
          location: product.location,
          created_by: userId,
          device_identifier: deviceId,
        });

        logger.debug(`Nueva etiqueta creada: ${label.id}`, {
          productId,
          userId,
          reference: product.reference,
        });
      }

      // Registrar operación en auditoría
      await auditLogger.logLabelOperation(
        userId,
        deviceId,
        {
          barcode: product.barcode,
          reference: product.reference,
          location: product.location,
          action: isUpdate ? "created" : "created", // Ambos se consideran "created" en auditoría
        },
        ipAddress
      );

      return label;
    } catch (error) {
      logger.error(
        `Error creando/actualizando etiqueta para producto: ${productId}`,
        error
      );
      throw error;
    }
  }

  /**
   * Obtener etiquetas pendientes para un usuario
   */
  public static async getPendingLabels(
    userId: string,
    deviceId?: string
  ): Promise<ProductLabel[]> {
    try {
      const whereClause: any = {
        created_by: userId,
        is_printed: false,
      };

      // Filtrar por dispositivo si se especifica
      if (deviceId) {
        whereClause.device_identifier = deviceId;
      }

      const labels = await ProductLabel.findAll({
        where: whereClause,
        order: [["created_at", "DESC"]],
        include: [
          {
            model: Product,
            as: "product",
            attributes: ["id", "status"],
            required: false,
          },
        ],
      });

      // Filtrar etiquetas de productos inactivos
      const activeLabels = labels.filter((label) => {
        // Si no hay producto asociado o el producto está inactivo, mantener la etiqueta
        // para que el usuario pueda decidir qué hacer
        return true;
      });

      logger.debug(`Etiquetas pendientes obtenidas: ${activeLabels.length}`, {
        userId,
        deviceId,
      });

      return activeLabels;
    } catch (error) {
      logger.error(
        `Error obteniendo etiquetas pendientes para usuario: ${userId}`,
        error
      );
      throw new AppError("Error obteniendo etiquetas pendientes", 500);
    }
  }

  /**
   * Eliminar etiquetas específicas
   */
  public static async deleteLabels(
    labelIds: string[],
    userId: string,
    deviceId: string,
    ipAddress?: string
  ): Promise<{ deleted: number; errors: string[] }> {
    const errors: string[] = [];
    let deleted = 0;

    try {
      for (const labelId of labelIds) {
        try {
          const label = await ProductLabel.findOne({
            where: {
              id: labelId,
              created_by: userId, // Solo permitir eliminar propias etiquetas
            },
          });

          if (!label) {
            errors.push(`Etiqueta ${labelId} no encontrada o sin permisos`);
            continue;
          }

          if (label.is_printed) {
            errors.push(
              `Etiqueta ${labelId} ya fue impresa y no se puede eliminar`
            );
            continue;
          }

          // Registrar en auditoría antes de eliminar
          await auditLogger.logLabelOperation(
            userId,
            deviceId,
            {
              barcode: label.barcode,
              reference: label.reference,
              location: label.location,
              action: "deleted",
            },
            ipAddress
          );

          await label.destroy();
          deleted++;

          logger.debug(`Etiqueta eliminada: ${labelId}`, {
            userId,
            reference: label.reference,
          });
        } catch (error) {
          logger.error(`Error eliminando etiqueta: ${labelId}`, error);
          errors.push(`Error eliminando etiqueta ${labelId}`);
        }
      }

      return { deleted, errors };
    } catch (error) {
      logger.error("Error en eliminación masiva de etiquetas:", error);
      throw new AppError("Error eliminando etiquetas", 500);
    }
  }

  /**
   * Generar trabajo de impresión
   */
  public static async createPrintJob(
    labelIds: string[],
    userId: string,
    deviceId: string,
    ipAddress?: string
  ): Promise<LabelPrintJob> {
    try {
      // Verificar que todas las etiquetas existen y pertenecen al usuario
      const labels = await ProductLabel.findAll({
        where: {
          id: { [Op.in]: labelIds },
          created_by: userId,
          is_printed: false,
        },
      });

      if (labels.length !== labelIds.length) {
        throw new AppError(
          "Algunas etiquetas no existen o ya fueron impresas",
          400
        );
      }

      // Generar ID único para el trabajo de impresión
      const jobId = `print_job_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const printJob: LabelPrintJob = {
        id: jobId,
        labelIds,
        userId,
        deviceId,
        status: "pending",
        createdAt: new Date(),
      };

      // Registrar trabajo de impresión en auditoría
      await auditLogger.logLabelOperation(
        userId,
        deviceId,
        {
          barcode: `PRINT_JOB_${labelIds.length}`,
          reference: `${labelIds.length} etiquetas`,
          location: "PRINT_QUEUE",
          action: "printed",
        },
        ipAddress
      );

      logger.info(`Trabajo de impresión creado: ${jobId}`, {
        userId,
        deviceId,
        labelCount: labelIds.length,
      });

      return printJob;
    } catch (error) {
      logger.error("Error creando trabajo de impresión:", error);
      throw error;
    }
  }

  /**
   * Marcar etiquetas como impresas
   */
  public static async markLabelsAsPrinted(
    labelIds: string[],
    userId: string,
    printJobId?: string
  ): Promise<{ updated: number; errors: string[] }> {
    const errors: string[] = [];
    let updated = 0;

    try {
      for (const labelId of labelIds) {
        try {
          const label = await ProductLabel.findOne({
            where: {
              id: labelId,
              created_by: userId,
            },
          });

          if (!label) {
            errors.push(`Etiqueta ${labelId} no encontrada`);
            continue;
          }

          if (label.is_printed) {
            errors.push(`Etiqueta ${labelId} ya estaba marcada como impresa`);
            continue;
          }

          await label.markAsPrinted();
          updated++;

          logger.debug(`Etiqueta marcada como impresa: ${labelId}`, {
            userId,
            printJobId,
            reference: label.reference,
          });
        } catch (error) {
          logger.error(
            `Error marcando etiqueta como impresa: ${labelId}`,
            error
          );
          errors.push(`Error actualizando etiqueta ${labelId}`);
        }
      }

      return { updated, errors };
    } catch (error) {
      logger.error("Error marcando etiquetas como impresas:", error);
      throw new AppError("Error actualizando estado de etiquetas", 500);
    }
  }

  /**
   * Generar formato DYMO para una etiqueta
   */
  public static generateDymoFormat(labelData: LabelData): DymoLabelFormat {
    return {
      width: 28, // mm
      height: 89, // mm
      elements: [
        // Referencia (parte superior, negrita)
        {
          type: "text",
          content: labelData.reference,
          x: 2,
          y: 2,
          width: 24,
          height: 8,
          fontSize: 12,
          fontWeight: "bold",
          alignment: "center",
        },
        // Descripción (debajo de referencia)
        {
          type: "text",
          content: this.truncateText(labelData.description, 25),
          x: 2,
          y: 12,
          width: 24,
          height: 20,
          fontSize: 8,
          fontWeight: "normal",
          alignment: "left",
        },
        // Ubicación (destacada)
        {
          type: "text",
          content: `LOC: ${labelData.location}`,
          x: 2,
          y: 34,
          width: 24,
          height: 8,
          fontSize: 10,
          fontWeight: "bold",
          alignment: "center",
        },
        // Código de barras (parte inferior)
        {
          type: "barcode",
          content: labelData.barcode,
          x: 2,
          y: 44,
          width: 24,
          height: 40,
        },
        // Código de barras como texto (debajo del código)
        {
          type: "text",
          content: labelData.barcode,
          x: 2,
          y: 86,
          width: 24,
          height: 3,
          fontSize: 6,
          fontWeight: "normal",
          alignment: "center",
        },
      ],
    };
  }

  /**
   * Generar múltiples formatos DYMO para impresión en lote
   */
  public static async generateBatchDymoFormat(
    labelIds: string[],
    userId: string
  ): Promise<DymoLabelFormat[]> {
    try {
      const labels = await ProductLabel.findAll({
        where: {
          id: { [Op.in]: labelIds },
          created_by: userId,
        },
      });

      return labels.map((label) =>
        this.generateDymoFormat({
          reference: label.reference,
          description: label.description,
          location: label.location,
          barcode: label.barcode,
        })
      );
    } catch (error) {
      logger.error("Error generando formatos DYMO en lote:", error);
      throw new AppError("Error generando formatos de impresión", 500);
    }
  }

  /**
   * Obtener estadísticas de etiquetas para un usuario
   */
  public static async getLabelStats(userId: string): Promise<{
    totalLabels: number;
    pendingLabels: number;
    printedLabels: number;
    labelsToday: number;
  }> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [totalLabels, pendingLabels, printedLabels, labelsToday] =
        await Promise.all([
          ProductLabel.count({ where: { created_by: userId } }),
          ProductLabel.count({
            where: { created_by: userId, is_printed: false },
          }),
          ProductLabel.count({
            where: { created_by: userId, is_printed: true },
          }),
          ProductLabel.count({
            where: {
              created_by: userId,
              created_at: { [Op.gte]: today },
            },
          }),
        ]);

      return {
        totalLabels,
        pendingLabels,
        printedLabels,
        labelsToday,
      };
    } catch (error) {
      logger.error(
        `Error obteniendo estadísticas de etiquetas para usuario: ${userId}`,
        error
      );
      throw new AppError("Error obteniendo estadísticas", 500);
    }
  }

  /**
   * Limpiar etiquetas antiguas impresas
   */
  public static async cleanupOldPrintedLabels(
    daysOld: number = 30
  ): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const deletedCount = await ProductLabel.destroy({
        where: {
          is_printed: true,
          printed_at: { [Op.lt]: cutoffDate },
        },
      });

      logger.info(`Etiquetas antiguas limpiadas: ${deletedCount}`, {
        daysOld,
        cutoffDate,
      });

      return deletedCount;
    } catch (error) {
      logger.error("Error limpiando etiquetas antiguas:", error);
      return 0;
    }
  }

  /**
   * Truncar texto para ajustarse al tamaño de la etiqueta
   */
  private static truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + "...";
  }

  /**
   * Validar formato de etiqueta DYMO
   */
  private static validateDymoFormat(format: DymoLabelFormat): boolean {
    // Validar dimensiones
    if (format.width !== 28 || format.height !== 89) {
      return false;
    }

    // Validar que todos los elementos estén dentro de los límites
    for (const element of format.elements) {
      if (element.x < 0 || element.y < 0) {
        return false;
      }
      if (element.x + (element.width || 0) > format.width) {
        return false;
      }
      if (element.y + (element.height || 0) > format.height) {
        return false;
      }
    }

    return true;
  }
}
