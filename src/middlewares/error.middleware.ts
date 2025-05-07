import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";

interface AppError extends Error {
  statusCode?: number;
}

const errorMiddleware = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): Response => {
  const statusCode = err.statusCode || 500;

  // Loggear el error
  logger.error(`[${statusCode}] ${err.message}`);

  // Responder con el error
  return res.status(statusCode).json({
    success: false,
    message: err.message || "Error interno del servidor",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
};

export default errorMiddleware;
