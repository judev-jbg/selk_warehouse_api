// src/routes/colocacion.routes.ts
import { Router } from "express";
import { authenticate, checkPermission } from "../middlewares/auth.middleware";
import { ProductController } from "../controllers/colocacion/product.controller";
import { LabelController } from "../controllers/colocacion/label.controller";
import {
  validate,
  colocacionValidation,
} from "../middlewares/validation.middleware";
import {
  searchRateLimit,
  updateRateLimit,
  generalRateLimit,
} from "../middlewares/rate-limit.middleware";
import { labelRateLimit } from "../middlewares/rate-limit.middleware";
import { SyncController } from "../controllers/colocacion/sync.controller";
import { AdvancedProductController } from "../controllers/colocacion/advanced-product.controller";
import { productSearchThrottle } from "../middlewares/search-timeout.middleware";
import { detectCriticalChanges } from "../middlewares/critical-change.middleware";
import { healthCheck } from "../middlewares/health.middleware";

const router = Router();
const productController = new ProductController();
const labelController = new LabelController();
const syncController = new SyncController();
const advancedProductController = new AdvancedProductController();

/**
 * @route   GET /api/v1/colocacion/products/search/:barcode
 * @desc    Buscar producto por código de barras
 * @access  Private (colocacion.read)
 */
router.get(
  "/products/search/:barcode",
  searchRateLimit,
  authenticate,
  checkPermission("colocacion", "read"),
  productController.searchByBarcode
);

/**
 * @route   PATCH /api/v1/colocacion/products/:id
 * @desc    Actualizar ubicación y/o stock de un producto
 * @access  Private (colocacion.write)
 */
router.patch(
  "/products/:id",
  updateRateLimit,
  authenticate,
  checkPermission("colocacion", "write"),
  validate(colocacionValidation.updateProduct),
  productController.updateProduct
);

/**
 * @route   GET /api/v1/colocacion/products/:id/location-history
 * @desc    Obtener historial de ubicaciones de un producto
 * @access  Private (colocacion.read)
 */
router.get(
  "/products/:id/location-history",
  generalRateLimit,
  authenticate,
  checkPermission("colocacion", "read"),
  productController.getLocationHistory
);

/**
 * @route   GET /api/v1/colocacion/products/location/:location
 * @desc    Buscar productos por ubicación
 * @access  Private (colocacion.read)
 */
router.get(
  "/products/location/:location",
  generalRateLimit,
  authenticate,
  checkPermission("colocacion", "read"),
  productController.getProductsByLocation
);

/**
 * @route   GET /api/v1/colocacion/products/location/:location/availability
 * @desc    Verificar disponibilidad de ubicación
 * @access  Private (colocacion.read)
 */
router.get(
  "/products/location/:location/availability",
  generalRateLimit,
  authenticate,
  checkPermission("colocacion", "read"),
  productController.checkLocationAvailability
);

/**
 * @route   GET /api/v1/colocacion/stats
 * @desc    Obtener estadísticas del módulo de colocación
 * @access  Private (colocacion.read)
 */
router.get(
  "/stats",
  generalRateLimit,
  authenticate,
  checkPermission("colocacion", "read"),
  productController.getStats
);

/**
 * @route   GET /api/v1/colocacion/cache/frequent
 * @desc    Obtener productos frecuentemente consultados
 * @access  Private (colocacion.read)
 */
router.get(
  "/cache/frequent",
  generalRateLimit,
  authenticate,
  checkPermission("colocacion", "read"),
  productController.getFrequentProducts
);

/**
 * @route   DELETE /api/v1/colocacion/cache/clear
 * @desc    Limpiar cache de productos (solo administradores)
 * @access  Private (colocacion.admin)
 */
router.delete(
  "/cache/clear",
  generalRateLimit,
  authenticate,
  checkPermission("colocacion", "admin"),
  productController.clearCache
);

/**
 * RUTAS DE ETIQUETAS
 */

/**
 * @route   GET /api/v1/colocacion/labels/pending
 * @desc    Obtener etiquetas pendientes de impresión
 * @access  Private (colocacion.read)
 */
router.get(
  "/labels/pending",
  labelRateLimit,
  authenticate,
  labelController.getPendingLabels
);

/**
 * @route   POST /api/v1/colocacion/labels/create
 * @desc    Crear etiqueta para un producto
 * @access  Private (colocacion.write)
 */
router.post(
  "/labels/create",
  labelRateLimit,
  authenticate,
  checkPermission("colocacion", "write"),
  labelController.createLabel
);

/**
 * @route   DELETE /api/v1/colocacion/labels
 * @desc    Eliminar etiquetas específicas
 * @access  Private (colocacion.write)
 */
router.delete(
  "/labels",
  labelRateLimit,
  authenticate,
  checkPermission("colocacion", "write"),
  labelController.deleteLabels
);

/**
 * @route   POST /api/v1/colocacion/labels/print
 * @desc    Enviar etiquetas a la cola de impresión
 * @access  Private (colocacion.write)
 */
router.post(
  "/labels/print",
  labelRateLimit,
  authenticate,
  checkPermission("colocacion", "write"),
  labelController.printLabels
);

/**
 * @route   GET /api/v1/colocacion/labels/:id/preview
 * @desc    Obtener vista previa de una etiqueta
 * @access  Private (colocacion.read)
 */
router.get(
  "/labels/:id/preview",
  generalRateLimit,
  authenticate,
  checkPermission("colocacion", "read"),
  labelController.getLabelPreview
);

/**
 * @route   POST /api/v1/colocacion/labels/batch-preview
 * @desc    Obtener vista previa de múltiples etiquetas
 * @access  Private (colocacion.read)
 */
router.post(
  "/labels/batch-preview",
  generalRateLimit,
  authenticate,
  checkPermission("colocacion", "read"),
  labelController.getBatchPreview
);

/**
 * @route   GET /api/v1/colocacion/labels/stats
 * @desc    Obtener estadísticas de etiquetas del usuario
 * @access  Private (colocacion.read)
 */
router.get(
  "/labels/stats",
  generalRateLimit,
  authenticate,
  checkPermission("colocacion", "read"),
  labelController.getLabelStats
);

/**
 * @route   GET /api/v1/colocacion/labels/print-queue/status
 * @desc    Obtener estado de la cola de impresión
 * @access  Private (colocacion.read)
 */
router.get(
  "/labels/print-queue/status",
  generalRateLimit,
  authenticate,
  checkPermission("colocacion", "read"),
  labelController.getPrintQueueStatus
);

/**
 * @route   DELETE /api/v1/colocacion/labels/print-queue/:jobId
 * @desc    Cancelar trabajo de impresión
 * @access  Private (colocacion.write)
 */
router.delete(
  "/labels/print-queue/:jobId",
  labelRateLimit,
  authenticate,
  checkPermission("colocacion", "write"),
  labelController.cancelPrintJob
);

/**
 * @route   DELETE /api/v1/colocacion/labels/cleanup
 * @desc    Limpiar etiquetas antiguas impresas (solo administradores)
 * @access  Private (colocacion.admin)
 */
router.delete(
  "/labels/cleanup",
  generalRateLimit,
  authenticate,
  checkPermission("colocacion", "admin"),
  labelController.cleanupOldLabels
);

/**
 * RUTAS AVANZADAS DE PRODUCTOS
 */

/**
 * @route   PATCH /api/v1/colocacion/products/:id/advanced
 * @desc    Actualizar producto con validaciones avanzadas y optimistic updates
 * @access  Private (colocacion.write)
 */
router.patch(
  "/products/:id/advanced",
  updateRateLimit,
  authenticate,
  checkPermission("colocacion", "write"),
  detectCriticalChanges,
  validate(colocacionValidation.updateProduct),
  advancedProductController.updateProductAdvanced
);

/**
 * @route   POST /api/v1/colocacion/products/validate
 * @desc    Validar datos de producto sin realizar cambios
 * @access  Private (colocacion.read)
 */
router.post(
  "/products/validate",
  generalRateLimit,
  authenticate,
  checkPermission("colocacion", "read"),
  advancedProductController.validateProductData
);

/**
 * @route   POST /api/v1/colocacion/undo
 * @desc    Deshacer última operación
 * @access  Private (colocacion.write)
 */
router.post(
  "/undo",
  updateRateLimit,
  authenticate,
  checkPermission("colocacion", "write"),
  advancedProductController.undoLastOperation
);

/**
 * @route   POST /api/v1/colocacion/redo
 * @desc    Rehacer operación
 * @access  Private (colocacion.write)
 */
router.post(
  "/redo",
  updateRateLimit,
  authenticate,
  checkPermission("colocacion", "write"),
  advancedProductController.redoLastOperation
);

/**
 * @route   GET /api/v1/colocacion/undo-redo/history
 * @desc    Obtener historial de operaciones undo/redo
 * @access  Private (colocacion.read)
 */
router.get(
  "/undo-redo/history",
  generalRateLimit,
  authenticate,
  checkPermission("colocacion", "read"),
  advancedProductController.getUndoRedoHistory
);

/**
 * @route   POST /api/v1/colocacion/barcode/validate
 * @desc    Validar código de barras con sugerencias
 * @access  Private (colocacion.read)
 */
router.post(
  "/barcode/validate",
  searchRateLimit,
  authenticate,
  checkPermission("colocacion", "read"),
  advancedProductController.validateBarcode
);

/**
 * RUTAS DE SINCRONIZACIÓN
 */

/**
 * @route   POST /api/v1/colocacion/sync/product/:id
 * @desc    Sincronizar producto específico con Odoo
 * @access  Private (colocacion.write)
 */
router.post(
  "/sync/product/:id",
  updateRateLimit,
  authenticate,
  checkPermission("colocacion", "write"),
  syncController.syncProduct
);

/**
 * @route   POST /api/v1/colocacion/sync/push/:id
 * @desc    Enviar cambios locales a Odoo
 * @access  Private (colocacion.write)
 */
router.post(
  "/sync/push/:id",
  updateRateLimit,
  authenticate,
  checkPermission("colocacion", "write"),
  syncController.pushToOdoo
);

/**
 * @route   POST /api/v1/colocacion/sync/full
 * @desc    Ejecutar sincronización completa (solo administradores)
 * @access  Private (colocacion.admin)
 */
router.post(
  "/sync/full",
  generalRateLimit,
  authenticate,
  checkPermission("colocacion", "admin"),
  syncController.fullSync
);

/**
 * @route   GET /api/v1/colocacion/sync/stats
 * @desc    Obtener estadísticas de sincronización
 * @access  Private (colocacion.read)
 */
router.get(
  "/sync/stats",
  generalRateLimit,
  authenticate,
  checkPermission("colocacion", "read"),
  syncController.getSyncStats
);

/**
 * @route   GET /api/v1/colocacion/sync/connectivity
 * @desc    Verificar conectividad con Odoo
 * @access  Private (colocacion.read)
 */
router.get(
  "/sync/connectivity",
  generalRateLimit,
  authenticate,
  checkPermission("colocacion", "read"),
  syncController.checkConnectivity
);

/**
 * RUTA DE HEALTH CHECK
 */

/**
 * @route   GET /api/v1/colocacion/health
 * @desc    Verificar salud del módulo de colocación
 * @access  Private (colocacion.read)
 */
router.get(
  "/health",
  generalRateLimit,
  authenticate,
  checkPermission("colocacion", "read"),
  healthCheck
);

// Aplicar middleware de throttle para búsquedas con sufijo
router.use("/products/search/:barcode", productSearchThrottle);

export default router;
