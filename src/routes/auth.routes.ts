import { Router } from "express";
import authController from "../controllers/auth.controller";
import authMiddleware from "../middlewares/auth.middleware";
import validationMiddleware from "../middlewares/validation.middleware";
import { loginSchema } from "../utils/validator";

const router = Router();

/**
 * @route POST /api/auth/login
 * @desc Iniciar sesión de usuario
 * @access Público
 */
router.post("/login", validationMiddleware(loginSchema), authController.login);

/**
 * @route POST /api/auth/logout
 * @desc Cerrar sesión de usuario
 * @access Privado
 */
router.post("/logout", authMiddleware, authController.logout);

/**
 * @route GET /api/auth/validate
 * @desc Validar token de usuario
 * @access Privado
 */
router.get("/validate", authMiddleware, authController.validateToken);

export default router;
