// src/routes/auth.routes.ts
import { Router } from "express";
import { AuthController } from "../controllers/auth/auth.controller";
import { authenticate, checkPermission } from "../middlewares/auth.middleware";
import { validate, authValidation } from "../middlewares/validation.middleware";

const router = Router();
const authController = new AuthController();

/**
 * @route   POST /api/v1/auth/login
 * @desc    Iniciar sesión con credenciales de Odoo
 * @access  Public
 */
router.post("/login", validate(authValidation.login), authController.login);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refrescar token de acceso
 * @access  Public
 */
router.post(
  "/refresh",
  validate(authValidation.refreshToken),
  authController.refreshToken
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Cerrar sesión
 * @access  Private
 */
router.post("/logout", authenticate, authController.logout);

/**
 * @route   GET /api/v1/auth/profile
 * @desc    Obtener perfil del usuario autenticado
 * @access  Private
 */
router.get("/profile", authenticate, authController.getProfile);

/**
 * @route   GET /api/v1/auth/audit-logs
 * @desc    Obtener logs de auditoría del usuario
 * @access  Private
 */
router.get("/audit-logs", authenticate, authController.getAuditLogs);

/**
 * @route   POST /api/v1/auth/verify-token
 * @desc    Verificar validez del token (debugging)
 * @access  Private
 */
router.post("/verify-token", authenticate, authController.verifyToken);

export default router;
