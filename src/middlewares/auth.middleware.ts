// src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service";
import { AppError } from "./error.middleware";
import { logger } from "../utils/logger";

// Extender Request para incluir información del usuario
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        username: string;
        odooUserId: number;
        permissions: any;
        deviceId: string;
      };
      deviceId?: string;
    }
  }
}

const authService = new AuthService();

/**
 * Middleware para verificar autenticación
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const deviceId = req.headers["device-id"] as string;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("Token de autorización requerido", 401);
    }

    if (!deviceId) {
      throw new AppError("Device-ID header requerido", 400);
    }

    const token = authHeader.substring(7); // Remover "Bearer "

    const decoded = await authService.verifyAccessToken(token);

    // Verificar que el device ID coincida
    if (decoded.deviceId !== deviceId) {
      throw new AppError("Device ID no coincide", 401);
    }

    // Agregar información del usuario al request
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      odooUserId: decoded.odooUserId,
      permissions: decoded.permissions,
      deviceId: decoded.deviceId,
    };

    req.deviceId = deviceId;

    next();
  } catch (error) {
    logger.error("Error en autenticación:", error);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(401).json({
      success: false,
      error: "Token inválido",
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Middleware para verificar permisos específicos
 */
export const checkPermission = (
  module: "colocacion" | "entrada" | "recogida",
  level: "read" | "write" | "admin"
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AppError("Usuario no autenticado", 401);
      }

      const userPermissions = req.user.permissions;

      if (!userPermissions[module] || !userPermissions[module][level]) {
        throw new AppError(
          `Sin permisos para ${level} en módulo ${module}`,
          403
        );
      }

      next();
    } catch (error) {
      logger.error("Error verificando permisos:", error);
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }

      return res.status(403).json({
        success: false,
        error: "Sin permisos suficientes",
        timestamp: new Date().toISOString(),
      });
    }
  };
};

/**
 * Middleware opcional de autenticación (no falla si no hay token)
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const decoded = await authService.verifyAccessToken(token);

      req.user = {
        userId: decoded.userId,
        username: decoded.username,
        odooUserId: decoded.odooUserId,
        permissions: decoded.permissions,
        deviceId: decoded.deviceId,
      };
    }

    next();
  } catch (error) {
    // En autenticación opcional, continuamos sin usuario
    next();
  }
};
