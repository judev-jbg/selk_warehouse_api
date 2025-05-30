// src/controllers/auth/auth.controller.ts
import { Request, Response, NextFunction } from "express";
import { AuthService } from "../../services/auth.service";
import { SupabaseService } from "../../services/supabase.service";
import { ApiResponse } from "../../types/common.types";
import { LoginRequest } from "../../types/auth.types";
import { logger } from "../../utils/logger";

export class AuthController {
  private authService: AuthService;
  private supabaseService: SupabaseService;

  constructor() {
    this.authService = new AuthService();
    this.supabaseService = new SupabaseService();
  }

  /**
   * POST /api/v1/auth/login
   * Iniciar sesión
   */
  login = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const loginData: LoginRequest = req.body;
      const ipAddress = req.ip || req.connection.remoteAddress || "unknown";

      const result = await this.authService.login(loginData, ipAddress);

      res.status(200).json({
        success: true,
        data: result,
        message: "Login exitoso",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/refresh
   * Refrescar token de acceso
   */
  refreshToken = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const { refresh_token, device_identifier } = req.body;

      const result = await this.authService.refreshToken(
        refresh_token,
        device_identifier
      );

      res.status(200).json({
        success: true,
        data: result,
        message: "Token refrescado exitosamente",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/logout
   * Cerrar sesión
   */
  logout = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const userId = req.user!.userId;
      const deviceId = req.deviceId!;

      await this.authService.logout(userId, deviceId);

      res.status(200).json({
        success: true,
        message: "Logout exitoso",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/auth/profile
   * Obtener perfil del usuario autenticado
   */
  getProfile = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const userId = req.user!.userId;

      const user = await this.authService.getProfile(userId);

      // Remover datos sensibles
      const { created_at, updated_at, last_odoo_sync, ...userProfile } = user;

      res.status(200).json({
        success: true,
        data: userProfile,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/auth/audit-logs
   * Obtener logs de auditoría del usuario
   */
  getAuditLogs = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const userId = req.user!.userId;
      const limit = parseInt(req.query.limit as string) || 50;

      const logs = await this.supabaseService.getUserAuditLogs(userId, limit);

      res.status(200).json({
        success: true,
        data: logs,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/verify-token
   * Verificar si un token es válido (para debugging)
   */
  verifyToken = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      // Si llegamos aquí, el middleware authenticate ya validó el token
      res.status(200).json({
        success: true,
        data: {
          valid: true,
          user: req.user,
        },
        message: "Token válido",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };
}
