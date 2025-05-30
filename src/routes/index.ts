// src/routes/index.ts
import { Router } from "express";
import authRoutes from "./auth.routes";
import { authenticate, checkPermission } from "../middlewares/auth.middleware";

const router = Router();

// Rutas de autenticación
router.use("/auth", authRoutes);

// Rutas de prueba para módulos (implementaremos después)
router.get(
  "/colocacion/test",
  authenticate,
  checkPermission("colocacion", "read"),
  (req, res) => {
    res.json({
      success: true,
      message: "Acceso al módulo Colocación autorizado",
      user: req.user,
      timestamp: new Date().toISOString(),
    });
  }
);

router.get(
  "/entrada/test",
  authenticate,
  checkPermission("entrada", "read"),
  (req, res) => {
    res.json({
      success: true,
      message: "Acceso al módulo Entrada autorizado",
      user: req.user,
      timestamp: new Date().toISOString(),
    });
  }
);

router.get(
  "/recogida/test",
  authenticate,
  checkPermission("recogida", "read"),
  (req, res) => {
    res.json({
      success: true,
      message: "Acceso al módulo Recogida autorizado",
      user: req.user,
      timestamp: new Date().toISOString(),
    });
  }
);

export default router;
