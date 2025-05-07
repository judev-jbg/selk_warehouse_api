const express = require("express");
const cors = require("cors");
const app = express();
const PORT = 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas
app.get("/", (req, res) => {
  res.json({ message: "API funcionando correctamente" });
});

// Login
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;

  console.log("Login attempt:", { username, password });

  // Credenciales para pruebas
  if (username === "operario1" && password === "password123") {
    return res.status(200).json({
      success: true,
      data: {
        id: 1,
        username: "operario1",
        name: "Operario 1",
        roles: ["operario"],
        token:
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJvcGVyYXJpbzEiLCJyb2xlcyI6WyJvcGVyYXJpbyJdfQ.example-token",
        refreshToken: "refresh-token-example",
      },
    });
  }

  return res.status(401).json({
    success: false,
    message: "Credenciales inválidas",
  });
});

// Validar token
app.get("/api/auth/validate", (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Token no proporcionado",
    });
  }

  // Para pruebas, cualquier token será válido
  return res.status(200).json({
    success: true,
    message: "Token válido",
  });
});

// WebSocket básico (simulado)
app.get("/ws", (req, res) => {
  res.json({ message: "WebSocket endpoint (simulado)" });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});
