// src/routes/colocacion.routes.ts
import { Router } from "express";
import { ProductController } from "../controllers/colocacion/product.controller";
import { authenticate, checkPermission } from "../middlewares/auth.middleware";
import {
  validate,
  colocacionValidation,
} from "../middlewares/validation.middleware";
import {
  searchRateLimit,
  updateRateLimit,
  generalRateLimit,
} from "../middlewares/rate-limit.middleware";

const router = Router();
const productController = new ProductController();

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

export default router;
