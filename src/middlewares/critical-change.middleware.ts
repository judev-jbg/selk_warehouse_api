// src/middleware/critical-change.middleware.ts
import { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis";
import { AppError } from "./error.middleware";
import { logger } from "../utils/logger";
import Product from "../models/Product";

interface CriticalChangeRule {
  field: string;
  condition: (oldValue: any, newValue: any, product: Product) => boolean;
  message: string;
  severity: "warning" | "critical";
  requiresConfirmation: boolean;
}

interface CriticalChangeDetection {
  hasCriticalChanges: boolean;
  warnings: Array<{
    field: string;
    message: string;
    severity: "warning" | "critical";
    oldValue: any;
    newValue: any;
  }>;
  requiresConfirmation: boolean;
  confirmationToken?: string;
}

/**
 * Reglas para detectar cambios críticos
 */
const CRITICAL_CHANGE_RULES: CriticalChangeRule[] = [
  {
    field: "stock",
    condition: (oldValue: number, newValue: number) =>
      newValue === 0 && oldValue > 0,
    message:
      "Se está poniendo el stock en 0. Esto podría afectar la disponibilidad del producto.",
    severity: "critical",
    requiresConfirmation: true,
  },
  {
    field: "stock",
    condition: (oldValue: number, newValue: number) => {
      const diff = Math.abs(newValue - oldValue);
      return diff > oldValue * 0.5 && oldValue > 0; // Cambio mayor al 50%
    },
    message:
      "Se está realizando un cambio significativo en el stock (más del 50%).",
    severity: "warning",
    requiresConfirmation: true,
  },
  {
    field: "stock",
    condition: (oldValue: number, newValue: number) => newValue < 0,
    message: "El stock no puede ser negativo.",
    severity: "critical",
    requiresConfirmation: false, // Este se rechaza directamente
  },
  {
    field: "location",
    condition: (oldValue: string | null, newValue: string | null) =>
      oldValue !== null && newValue === null,
    message:
      "Se está eliminando la ubicación del producto. El producto quedará sin ubicar.",
    severity: "warning",
    requiresConfirmation: true,
  },
  {
    field: "stock",
    condition: (oldValue: number, newValue: number, product: Product) => {
      // Stock muy alto comparado con el promedio (necesitaríamos calcular esto)
      return newValue > 10000 && oldValue < 1000;
    },
    message:
      "Se está estableciendo un stock muy alto. Verifique que el valor sea correcto.",
    severity: "warning",
    requiresConfirmation: true,
  },
];

/**
 * Middleware para detectar y manejar cambios críticos
 */
export const detectCriticalChanges = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { location, stock, confirmationToken } = req.body;
    const userId = req.user!.userId;

    // Obtener producto actual
    const product = await Product.findByPk(id);
    if (!product) {
      throw new AppError("Producto no encontrado", 404);
    }

    const detection = await detectCriticalChangesInData(
      product,
      { location, stock },
      userId
    );

    // Si hay cambios que requieren confirmación y no se proporcionó token
    if (detection.requiresConfirmation && !confirmationToken) {
      return res.status(409).json({
        success: false,
        error: "Confirmación requerida",
        data: {
          criticalChanges: detection,
          message:
            "Los cambios detectados requieren confirmación antes de proceder.",
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Si se proporcionó token, verificarlo
    if (confirmationToken) {
      const isValidToken = await verifyConfirmationToken(
        confirmationToken,
        userId,
        id
      );
      if (!isValidToken) {
        throw new AppError("Token de confirmación inválido o expirado", 400);
      }

      // Limpiar token después de usarlo
      await clearConfirmationToken(confirmationToken);
    }

    // Verificar si hay cambios críticos que deben rechazarse
    const criticalErrors = detection.warnings.filter(
      (w) =>
        w.severity === "critical" && w.field === "stock" && req.body.stock < 0
    );

    if (criticalErrors.length > 0) {
      throw new AppError(criticalErrors[0].message, 400);
    }

    // Agregar información de detección al request para uso posterior
    req.criticalChangeDetection = detection;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Detectar cambios críticos en los datos
 */
async function detectCriticalChangesInData(
  product: Product,
  newData: { location?: string | null; stock?: number },
  userId: string
): Promise<CriticalChangeDetection> {
  const warnings: CriticalChangeDetection["warnings"] = [];
  let requiresConfirmation = false;

  // Verificar cada regla
  for (const rule of CRITICAL_CHANGE_RULES) {
    let oldValue: any;
    let newValue: any;

    if (rule.field === "stock" && newData.stock !== undefined) {
      oldValue = product.stock;
      newValue = newData.stock;
    } else if (rule.field === "location" && newData.location !== undefined) {
      oldValue = product.location;
      newValue = newData.location;
    } else {
      continue; // Este campo no se está actualizando
    }

    if (rule.condition(oldValue, newValue, product)) {
      warnings.push({
        field: rule.field,
        message: rule.message,
        severity: rule.severity,
        oldValue,
        newValue,
      });

      if (rule.requiresConfirmation) {
        requiresConfirmation = true;
      }
    }
  }

  let confirmationToken: string | undefined;
  if (requiresConfirmation) {
    confirmationToken = await generateConfirmationToken(
      userId,
      product.id,
      newData
    );
  }

  return {
    hasCriticalChanges: warnings.length > 0,
    warnings,
    requiresConfirmation,
    confirmationToken,
  };
}

/**
 * Generar token de confirmación
 */
async function generateConfirmationToken(
  userId: string,
  productId: string,
  newData: any
): Promise<string> {
  const token = `confirm_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;
  const tokenData = {
    userId,
    productId,
    newData,
    timestamp: Date.now(),
  };

  const tokenKey = `critical_change_token:${token}`;
  await redis.setex(tokenKey, 300, JSON.stringify(tokenData)); // 5 minutos TTL

  logger.debug(`Token de confirmación generado: ${token}`, {
    userId,
    productId,
  });

  return token;
}

/**
 * Verificar token de confirmación
 */
async function verifyConfirmationToken(
  token: string,
  userId: string,
  productId: string
): Promise<boolean> {
  try {
    const tokenKey = `critical_change_token:${token}`;
    const tokenDataStr = await redis.get(tokenKey);

    if (!tokenDataStr) {
      return false;
    }

    const tokenData = JSON.parse(tokenDataStr);

    // Verificar que el token pertenece al usuario y producto correctos
    if (tokenData.userId !== userId || tokenData.productId !== productId) {
      return false;
    }

    // Verificar que no haya expirado (redundante, pero por seguridad)
    const age = Date.now() - tokenData.timestamp;
    if (age > 300000) {
      // 5 minutos
      return false;
    }

    return true;
  } catch (error) {
    logger.error("Error verificando token de confirmación:", error);
    return false;
  }
}

/**
 * Limpiar token de confirmación
 */
async function clearConfirmationToken(token: string): Promise<void> {
  try {
    const tokenKey = `critical_change_token:${token}`;
    await redis.del(tokenKey);
    logger.debug(`Token de confirmación limpiado: ${token}`);
  } catch (error) {
    logger.error("Error limpiando token de confirmación:", error);
  }
}

/**
 * Extender el tipo Request para incluir detección de cambios críticos
 */
declare global {
  namespace Express {
    interface Request {
      criticalChangeDetection?: CriticalChangeDetection;
    }
  }
}

export { CriticalChangeDetection, CriticalChangeRule };
