// src/middleware/validation.middleware.ts
import { Request, Response, NextFunction } from "express";
import Joi from "joi";
import { AppError } from "./error.middleware";

/**
 * Middleware genérico para validación con Joi
 */
export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body);

    if (error) {
      const errorMessage = error.details
        .map((detail) => detail.message)
        .join(", ");
      throw new AppError(`Error de validación: ${errorMessage}`, 400);
    }

    next();
  };
};

/**
 * Esquemas de validación para autenticación
 */
export const authValidation = {
  login: Joi.object({
    username: Joi.string().min(3).max(50).required().messages({
      "string.min": "El username debe tener al menos 3 caracteres",
      "string.max": "El username no puede tener más de 50 caracteres",
      "any.required": "El username es requerido",
    }),

    password: Joi.string().min(1).required().messages({
      "string.min": "La contraseña es requerida",
      "any.required": "La contraseña es requerida",
    }),

    device_identifier: Joi.string().min(10).max(255).required().messages({
      "string.min":
        "El identificador del dispositivo debe tener al menos 10 caracteres",
      "string.max": "El identificador del dispositivo es demasiado largo",
      "any.required": "El identificador del dispositivo es requerido",
    }),
  }),

  refreshToken: Joi.object({
    refresh_token: Joi.string().required().messages({
      "any.required": "El refresh token es requerido",
    }),

    device_identifier: Joi.string().required().messages({
      "any.required": "El identificador del dispositivo es requerido",
    }),
  }),
};

/**
 * Esquemas de validación para colocación
 */
export const colocacionValidation = {
  // Validación para actualización de producto
  updateProduct: Joi.object({
    location: Joi.string()
      .pattern(/^[A-Z]\d{2}[0-5]$/)
      .allow(null, "")
      .messages({
        "string.pattern.base":
          "La ubicación debe tener el formato: Letra + 2 dígitos + altura (0-5). Ejemplo: A213",
      }),

    stock: Joi.number().min(0).precision(3).messages({
      "number.min": "El stock no puede ser negativo",
      "number.precision": "El stock puede tener máximo 3 decimales",
    }),
  })
    .min(1)
    .messages({
      "object.min":
        "Debe proporcionar al menos un campo para actualizar (location o stock)",
    }),

  // Validación para código de barras
  barcode: Joi.string()
    .pattern(/^[0-9]{13,14}$/)
    .required()
    .messages({
      "string.pattern.base":
        "El código de barras debe ser EAN13 (13 dígitos) o DUN14 (14 dígitos)",
      "any.required": "El código de barras es requerido",
    }),

  // Validación para ubicación
  location: Joi.string()
    .pattern(/^[A-Z]\d{2}[0-5]$/)
    .required()
    .messages({
      "string.pattern.base":
        "La ubicación debe tener el formato: Letra + 2 dígitos + altura (0-5). Ejemplo: A213",
      "any.required": "La ubicación es requerida",
    }),
};
