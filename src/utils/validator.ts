import Joi from "joi";

// Esquema para validar login
export const loginSchema = Joi.object({
  username: Joi.string().required().messages({
    "string.empty": "El nombre de usuario es obligatorio",
    "any.required": "El nombre de usuario es obligatorio",
  }),
  password: Joi.string().required().messages({
    "string.empty": "La contraseña es obligatoria",
    "any.required": "La contraseña es obligatoria",
  }),
});
