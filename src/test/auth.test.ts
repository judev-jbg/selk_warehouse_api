import request from "supertest";
import { app } from "../app";
import User from "../models/user.model";
import jwt from "jsonwebtoken";
import env from "../config/environment";

// Mock de User.findOne
jest.mock("../models/user.model", () => ({
  findOne: jest.fn(),
}));

// Mock de User.comparePassword
const mockComparePassword = jest.fn();
(User as any).findOne.mockImplementation(() => ({
  id: 1,
  username: "operario1",
  name: "Operario 1",
  roles: ["operario"],
  comparePassword: mockComparePassword,
}));

describe("Auth Controller", () => {
  describe("POST /api/auth/login", () => {
    it("debe iniciar sesión correctamente", async () => {
      // Arrange
      mockComparePassword.mockResolvedValueOnce(true);

      // Act
      const response = await request(app)
        .post("/api/auth/login")
        .send({ username: "operario1", password: "password123" });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.username).toBe("operario1");
      expect(response.body.data.token).toBeDefined();
    });

    it("debe rechazar credenciales inválidas", async () => {
      // Arrange
      mockComparePassword.mockResolvedValueOnce(false);

      // Act
      const response = await request(app)
        .post("/api/auth/login")
        .send({ username: "operario1", password: "password_incorrecto" });

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Credenciales inválidas");
    });
  });

  describe("GET /api/auth/validate", () => {
    it("debe validar un token correcto", async () => {
      // Arrange
      const token = jwt.sign(
        { id: 1, username: "operario1", roles: ["operario"] },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN }
      );

      // Act
      const response = await request(app)
        .get("/api/auth/validate")
        .set("Authorization", `Bearer ${token}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Token válido");
    });

    it("debe rechazar un token inválido", async () => {
      // Act
      const response = await request(app)
        .get("/api/auth/validate")
        .set("Authorization", "Bearer token_invalido");

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Token inválido");
    });
  });
});
