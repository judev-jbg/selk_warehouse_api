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
