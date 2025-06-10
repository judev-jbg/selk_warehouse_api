// src/services/colocacion/optimistic-update.service.ts
import { redis } from "../config/redis";
import Product from "../models/Product";
import { logger } from "../utils/logger";
import { AppError } from "../middlewares/error.middleware";

interface OptimisticUpdateData {
  productId: string;
  userId: string;
  deviceId: string;
  originalData: {
    location: string | null;
    stock: number;
    last_odoo_sync: Date | null;
  };
  newData: {
    location?: string | null;
    stock?: number;
  };
  timestamp: number;
  confirmed: boolean;
  rollbackReason?: string;
}

interface UndoRedoOperation {
  id: string;
  productId: string;
  userId: string;
  deviceId: string;
  operation: "update";
  beforeData: {
    location: string | null;
    stock: number;
  };
  afterData: {
    location: string | null;
    stock: number;
  };
  timestamp: number;
  canUndo: boolean;
  canRedo: boolean;
}

export class OptimisticUpdateService {
  private static readonly UPDATE_PREFIX = "optimistic_update:";
  private static readonly UNDO_REDO_PREFIX = "undo_redo:";
  private static readonly UPDATE_TTL = 300; // 5 minutos
  private static readonly UNDO_REDO_TTL = 3600; // 1 hora
  private static readonly MAX_UNDO_OPERATIONS = 10;

  /**
   * Crear actualización optimista
   */
  public static async createOptimisticUpdate(
    product: Product,
    newData: { location?: string | null; stock?: number },
    userId: string,
    deviceId: string
  ): Promise<string> {
    try {
      const updateId = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const updateKey = this.UPDATE_PREFIX + updateId;

      const optimisticData: OptimisticUpdateData = {
        productId: product.id,
        userId,
        deviceId,
        originalData: {
          location: product.location,
          stock: product.stock,
          last_odoo_sync: product.last_odoo_sync,
        },
        newData,
        timestamp: Date.now(),
        confirmed: false,
      };

      await redis.setex(
        updateKey,
        this.UPDATE_TTL,
        JSON.stringify(optimisticData)
      );

      logger.debug(`Actualización optimista creada: ${updateId}`, {
        productId: product.id,
        userId,
        deviceId,
      });

      return updateId;
    } catch (error) {
      logger.error("Error creando actualización optimista:", error);
      throw new AppError("Error preparando actualización", 500);
    }
  }

  /**
   * Confirmar actualización optimista
   */
  public static async confirmOptimisticUpdate(
    updateId: string
  ): Promise<boolean> {
    try {
      const updateKey = this.UPDATE_PREFIX + updateId;
      const updateDataStr = await redis.get(updateKey);

      if (!updateDataStr) {
        logger.warn(`Actualización optimista no encontrada: ${updateId}`);
        return false;
      }

      const updateData: OptimisticUpdateData = JSON.parse(updateDataStr);
      updateData.confirmed = true;

      // Actualizar en Redis
      await redis.setex(updateKey, this.UPDATE_TTL, JSON.stringify(updateData));

      // Crear operación undo/redo
      await this.createUndoRedoOperation(updateData);

      logger.debug(`Actualización optimista confirmada: ${updateId}`);
      return true;
    } catch (error) {
      logger.error(
        `Error confirmando actualización optimista: ${updateId}`,
        error
      );
      return false;
    }
  }

  /**
   * Rollback de actualización optimista
   */
  public static async rollbackOptimisticUpdate(
    updateId: string,
    reason: string = "Error en la actualización"
  ): Promise<boolean> {
    try {
      const updateKey = this.UPDATE_PREFIX + updateId;
      const updateDataStr = await redis.get(updateKey);

      if (!updateDataStr) {
        logger.warn(
          `Actualización optimista no encontrada para rollback: ${updateId}`
        );
        return false;
      }

      const updateData: OptimisticUpdateData = JSON.parse(updateDataStr);

      if (updateData.confirmed) {
        logger.warn(
          `No se puede hacer rollback de una actualización confirmada: ${updateId}`
        );
        return false;
      }

      // Restaurar datos originales
      const product = await Product.findByPk(updateData.productId);
      if (product) {
        product.location = updateData.originalData.location;
        product.stock = updateData.originalData.stock;
        product.last_odoo_sync = updateData.originalData.last_odoo_sync;
        await product.save();
      }

      // Marcar como rollback
      updateData.rollbackReason = reason;
      await redis.setex(updateKey, this.UPDATE_TTL, JSON.stringify(updateData));

      logger.info(`Rollback realizado para actualización: ${updateId}`, {
        productId: updateData.productId,
        reason,
      });

      return true;
    } catch (error) {
      logger.error(`Error en rollback de actualización: ${updateId}`, error);
      return false;
    }
  }

  /**
   * Crear operación undo/redo
   */
  private static async createUndoRedoOperation(
    updateData: OptimisticUpdateData
  ): Promise<void> {
    try {
      const operationId = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const undoRedoKey =
        this.UNDO_REDO_PREFIX + `${updateData.userId}:${updateData.deviceId}`;

      const operation: UndoRedoOperation = {
        id: operationId,
        productId: updateData.productId,
        userId: updateData.userId,
        deviceId: updateData.deviceId,
        operation: "update",
        beforeData: {
          location: updateData.originalData.location,
          stock: updateData.originalData.stock,
        },
        afterData: {
          location:
            updateData.newData.location !== undefined
              ? updateData.newData.location
              : updateData.originalData.location,
          stock:
            updateData.newData.stock !== undefined
              ? updateData.newData.stock
              : updateData.originalData.stock,
        },
        timestamp: updateData.timestamp,
        canUndo: true,
        canRedo: false,
      };

      // Obtener operaciones existentes
      const existingOperationsStr = await redis.get(undoRedoKey);
      let operations: UndoRedoOperation[] = [];

      if (existingOperationsStr) {
        operations = JSON.parse(existingOperationsStr);
      }

      // Agregar nueva operación al inicio
      operations.unshift(operation);

      // Mantener solo las últimas MAX_UNDO_OPERATIONS
      if (operations.length > this.MAX_UNDO_OPERATIONS) {
        operations = operations.slice(0, this.MAX_UNDO_OPERATIONS);
      }

      // Marcar todas las operaciones anteriores como no-redo
      operations.forEach((op, index) => {
        if (index > 0) {
          op.canRedo = false;
        }
      });

      await redis.setex(
        undoRedoKey,
        this.UNDO_REDO_TTL,
        JSON.stringify(operations)
      );

      logger.debug(`Operación undo/redo creada: ${operationId}`, {
        productId: updateData.productId,
        userId: updateData.userId,
      });
    } catch (error) {
      logger.error("Error creando operación undo/redo:", error);
    }
  }

  /**
   * Deshacer última operación
   */
  public static async undoLastOperation(
    userId: string,
    deviceId: string
  ): Promise<{
    success: boolean;
    operation?: UndoRedoOperation;
    product?: Product;
  }> {
    try {
      const undoRedoKey = this.UNDO_REDO_PREFIX + `${userId}:${deviceId}`;
      const operationsStr = await redis.get(undoRedoKey);

      if (!operationsStr) {
        return { success: false };
      }

      const operations: UndoRedoOperation[] = JSON.parse(operationsStr);
      const undoableOperation = operations.find((op) => op.canUndo);

      if (!undoableOperation) {
        return { success: false };
      }

      // Aplicar undo
      const product = await Product.findByPk(undoableOperation.productId);
      if (!product) {
        return { success: false };
      }

      product.location = undoableOperation.beforeData.location;
      product.stock = undoableOperation.beforeData.stock;
      product.last_odoo_sync = new Date();
      await product.save();

      // Actualizar estado de operaciones
      undoableOperation.canUndo = false;
      undoableOperation.canRedo = true;

      await redis.setex(
        undoRedoKey,
        this.UNDO_REDO_TTL,
        JSON.stringify(operations)
      );

      logger.info(`Operación deshecha: ${undoableOperation.id}`, {
        productId: product.id,
        userId,
        deviceId,
      });

      return {
        success: true,
        operation: undoableOperation,
        product,
      };
    } catch (error) {
      logger.error("Error deshaciendo operación:", error);
      return { success: false };
    }
  }

  /**
   * Rehacer operación
   */
  public static async redoLastOperation(
    userId: string,
    deviceId: string
  ): Promise<{
    success: boolean;
    operation?: UndoRedoOperation;
    product?: Product;
  }> {
    try {
      const undoRedoKey = this.UNDO_REDO_PREFIX + `${userId}:${deviceId}`;
      const operationsStr = await redis.get(undoRedoKey);

      if (!operationsStr) {
        return { success: false };
      }

      const operations: UndoRedoOperation[] = JSON.parse(operationsStr);
      const redoableOperation = operations.find((op) => op.canRedo);

      if (!redoableOperation) {
        return { success: false };
      }

      // Aplicar redo
      const product = await Product.findByPk(redoableOperation.productId);
      if (!product) {
        return { success: false };
      }

      product.location = redoableOperation.afterData.location;
      product.stock = redoableOperation.afterData.stock;
      product.last_odoo_sync = new Date();
      await product.save();

      // Actualizar estado de operaciones
      redoableOperation.canUndo = true;
      redoableOperation.canRedo = false;

      await redis.setex(
        undoRedoKey,
        this.UNDO_REDO_TTL,
        JSON.stringify(operations)
      );

      logger.info(`Operación rehecha: ${redoableOperation.id}`, {
        productId: product.id,
        userId,
        deviceId,
      });

      return {
        success: true,
        operation: redoableOperation,
        product,
      };
    } catch (error) {
      logger.error("Error rehaciendo operación:", error);
      return { success: false };
    }
  }

  /**
   * Obtener historial de operaciones undo/redo
   */
  public static async getUndoRedoHistory(
    userId: string,
    deviceId: string
  ): Promise<UndoRedoOperation[]> {
    try {
      const undoRedoKey = this.UNDO_REDO_PREFIX + `${userId}:${deviceId}`;
      const operationsStr = await redis.get(undoRedoKey);

      if (!operationsStr) {
        return [];
      }

      return JSON.parse(operationsStr);
    } catch (error) {
      logger.error("Error obteniendo historial undo/redo:", error);
      return [];
    }
  }

  /**
   * Limpiar operaciones expiradas
   */
  public static async cleanupExpiredOperations(): Promise<void> {
    try {
      const pattern = this.UPDATE_PREFIX + "*";
      const keys = await redis.keys(pattern);

      for (const key of keys) {
        const updateDataStr = await redis.get(key);
        if (updateDataStr) {
          const updateData: OptimisticUpdateData = JSON.parse(updateDataStr);
          const age = Date.now() - updateData.timestamp;

          // Si la operación no está confirmada y es muy antigua, hacer rollback
          if (!updateData.confirmed && age > this.UPDATE_TTL * 1000) {
            const updateId = key.replace(this.UPDATE_PREFIX, "");
            await this.rollbackOptimisticUpdate(updateId, "Operación expirada");
          }
        }
      }

      logger.debug("Limpieza de operaciones expiradas completada");
    } catch (error) {
      logger.error("Error limpiando operaciones expiradas:", error);
    }
  }
}
