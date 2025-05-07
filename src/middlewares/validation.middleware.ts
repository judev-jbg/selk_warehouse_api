import { Request, Response, NextFunction, RequestHandler } from "express";
import Joi from "joi";

const validationMiddleware = (schema: Joi.ObjectSchema): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.body);

    if (error) {
      res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
      return;
    }

    next();
  };
};

export default validationMiddleware;
