import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import env from "../config/environment";

interface DecodedToken {
  id: number;
  username: string;
  roles: string[];
}

// Extender la interfaz Request para incluir el usuario
declare global {
  namespace Express {
    interface Request {
      user?: DecodedToken;
    }
  }
}

const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void | Response => {
  try {
    // Obtener el token del header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Token no proporcionado",
      });
    }

    const token = authHeader.split(" ")[1];

    // Verificar token
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as DecodedToken;
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Token inválido",
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error al verificar token",
    });
  }
};

export default authMiddleware;
