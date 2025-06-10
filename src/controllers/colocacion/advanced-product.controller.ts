// src/controllers/colocacion/advanced-product.controller.ts
import { Request, Response, NextFunction } from "express";
import { ProductService } from "../../services/product.service";
import { ValidationService } from "../../services/validation.service";
import { OptimisticUpdateService } from "../../services/optimistic-update.service";
import { ApiResponse } from "../../types/common.types";
import { logger } from "../../utils/logger";
import { AppError } from "../../middlewares/error.middleware";

export class AdvancedProductController {
  /**
   * PATCH /api/v1/colocacion/products/:id/advanced
   * Actualizar producto con validaciones avanzadas y optimistic updates
   */
  public updateProductAdvanced = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    let optimisticUpdateId: string | null = null;

    try {
      const { id } = req.params;
      const { location, stock, skipValidation = false } = req.body;
      const userId = req.user!.userId;
      const deviceId = req.deviceId!;
      const ipAddress = req.ip || req.connection.remoteAddress || "unknown";

      logger.info(`Actualización avanzada iniciada: ${id}`, {
        location,
        stock,
        skipValidation,
        userId,
        deviceId,
      });

      // Obtener producto
      const product = await ProductService.searchByBarcode(
        id,
        userId,
        deviceId,
        ipAddress
      );
      if (!product.found || !product.product) {
        throw new AppError("Producto no encontrado", 404);
      }

      // Ejecutar validaciones avanzadas si no se saltean
      if (!skipValidation) {
        const validation = await ValidationService.validateProductUpdate(
          product.product.id,
          { location, stock },
          userId
        );

        if (!validation.isValid) {
          return res.status(400).json({
            success: false,
            error: "Validación fallida",
            data: {
              validation,
              criticalChanges: req.criticalChangeDetection,
            },
            message: "Los datos proporcionados no pasaron las validaciones",
            timestamp: new Date().toISOString(),
          });
        }

        // Si hay warnings, incluirlos en la respuesta pero continuar
        if (validation.warnings.length > 0 || validation.suggestions?.length) {
          logger.info(`Validación con advertencias para producto ${id}`, {
            warnings: validation.warnings,
            suggestions: validation.suggestions,
          });
        }
      }

      // Crear actualización optimista
      optimisticUpdateId = await OptimisticUpdateService.createOptimisticUpdate(
        product.product,
        { location, stock },
        userId,
        deviceId
      );

      // Aplicar cambios temporalmente (optimistic update)
      const originalLocation = product.product.location;
      const originalStock = product.product.stock;

      if (location !== undefined) {
        product.product.location = location;
      }
      if (stock !== undefined) {
        product.product.stock = stock;
      }

      try {
        // Intentar la actualización real
        const result = await ProductService.updateProduct(
          product.product.id,
          { location, stock },
          userId,
          deviceId,
          ipAddress
        );

        // Confirmar actualización optimista
        await OptimisticUpdateService.confirmOptimisticUpdate(
          optimisticUpdateId
        );

        // Respuesta exitosa con información completa
        res.status(200).json({
          success: true,
          data: {
            product: {
              id: result.product.id,
              barcode: result.product.barcode,
              reference: result.product.reference,
              description: result.product.description,
              location: result.product.location,
              stock: result.product.stock,
              status: result.product.status,
              last_odoo_sync: result.product.last_odoo_sync,
            },
            changes: result.changes,
            labelCreated: result.labelCreated || false,
            optimisticUpdateId,
            validation: skipValidation
              ? null
              : await ValidationService.validateProductUpdate(
                  result.product.id,
                  { location, stock },
                  userId
                ),
            undoRedoAvailable: true,
          },
          message: "Producto actualizado correctamente",
          timestamp: new Date().toISOString(),
        });
      } catch (updateError) {
        // Rollback de actualización optimista
        await OptimisticUpdateService.rollbackOptimisticUpdate(
          optimisticUpdateId,
          updateError instanceof Error
            ? updateError.message
            : "Error en actualización"
        );

        // Restaurar valores originales
        product.product.location = originalLocation;
        product.product.stock = originalStock;

        logger.error(
          `Error en actualización, rollback realizado: ${id}`,
          updateError
        );
        throw updateError;
      }
    } catch (error) {
      // Rollback de actualización optimista si existe
      if (optimisticUpdateId) {
        await OptimisticUpdateService.rollbackOptimisticUpdate(
          optimisticUpdateId,
          error instanceof Error ? error.message : "Error en actualización"
        );
      }

      logger.error("Error en actualización avanzada:", error);
      next(error);
    }
  };

  /**
   * POST /api/v1/colocacion/products/validate
   * Validar datos de producto sin realizar cambios
   */
  public validateProductData = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const { productId, location, stock } = req.body;
      const userId = req.user!.userId;

      const validation = await ValidationService.validateProductUpdate(
        productId,
        { location, stock },
        userId
      );

      res.status(200).json({
        success: true,
        data: validation,
        message: validation.isValid
          ? "Validación exitosa"
          : "Validación con errores",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error en validación de datos:", error);
      next(error);
    }
  };

  /**
   * POST /api/v1/colocacion/undo
   * Deshacer última operación
   */
  public undoLastOperation = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const userId = req.user!.userId;
      const deviceId = req.deviceId!;

      const result = await OptimisticUpdateService.undoLastOperation(
        userId,
        deviceId
      );

      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: "No hay operaciones para deshacer",
          timestamp: new Date().toISOString(),
        });
      }

      res.status(200).json({
        success: true,
        data: {
          operation: result.operation,
          product: result.product
            ? {
                id: result.product.id,
                barcode: result.product.barcode,
                reference: result.product.reference,
                description: result.product.description,
                location: result.product.location,
                stock: result.product.stock,
              }
            : null,
        },
        message: "Operación deshecha correctamente",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error deshaciendo operación:", error);
      next(error);
    }
  };

  /**
   * POST /api/v1/colocacion/redo
   * Rehacer operación
   */
  public redoLastOperation = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const userId = req.user!.userId;
      const deviceId = req.deviceId!;

      const result = await OptimisticUpdateService.redoLastOperation(
        userId,
        deviceId
      );

      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: "No hay operaciones para rehacer",
          timestamp: new Date().toISOString(),
        });
      }

      res.status(200).json({
        success: true,
        data: {
          operation: result.operation,
          product: result.product
            ? {
                id: result.product.id,
                barcode: result.product.barcode,
                reference: result.product.reference,
                description: result.product.description,
                location: result.product.location,
                stock: result.product.stock,
              }
            : null,
        },
        message: "Operación rehecha correctamente",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error rehaciendo operación:", error);
      next(error);
    }
  };

  /**
   * GET /api/v1/colocacion/undo-redo/history
   * Obtener historial de operaciones undo/redo
   */
  public getUndoRedoHistory = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const userId = req.user!.userId;
      const deviceId = req.deviceId!;

      const history = await OptimisticUpdateService.getUndoRedoHistory(
        userId,
        deviceId
      );

      res.status(200).json({
        success: true,
        data: {
          operations: history,
          canUndo: history.some((op) => op.canUndo),
          canRedo: history.some((op) => op.canRedo),
        },
        message: "Historial de operaciones obtenido",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error obteniendo historial undo/redo:", error);
      next(error);
    }
  };

  /**
   * POST /api/v1/colocacion/barcode/validate
   * Validar código de barras con sugerencias
   */
  public validateBarcode = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const { barcode } = req.body;

      if (!barcode) {
        throw new AppError("Código de barras requerido", 400);
      }

      const validation =
        ValidationService.validateBarcodeWithSuggestions(barcode);

      res.status(200).json({
        success: validation.isValid,
        data: validation,
        message: validation.isValid
          ? "Código de barras válido"
          : "Código de barras inválido",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error validando código de barras:", error);
      next(error);
    }
  };
}
