// src/models/Product.ts
import { Model, DataTypes, Optional } from "sequelize";
import sequelize from "../config/database";

interface ProductAttributes {
  id: string;
  barcode: string;
  reference: string;
  description: string;
  location: string | null;
  stock: number;
  status: "active" | "inactive";
  odoo_product_id: number;
  created_at: Date;
  updated_at: Date;
  last_odoo_sync: Date | null;
}

interface ProductCreationAttributes
  extends Optional<
    ProductAttributes,
    "id" | "created_at" | "updated_at" | "last_odoo_sync"
  > {}

class Product
  extends Model<ProductAttributes, ProductCreationAttributes>
  implements ProductAttributes
{
  public id!: string;
  public barcode!: string;
  public reference!: string;
  public description!: string;
  public location!: string | null;
  public stock!: number;
  public status!: "active" | "inactive";
  public odoo_product_id!: number;
  public created_at!: Date;
  public updated_at!: Date;
  public last_odoo_sync!: Date | null;

  // Método para verificar si el producto está activo
  public isActive(): boolean {
    return this.status === "active";
  }

  // Método para actualizar ubicación y stock
  public async updateLocationAndStock(
    location: string | null,
    stock: number,
    userId: string
  ): Promise<boolean> {
    try {
      const oldLocation = this.location;
      const oldStock = this.stock;

      this.location = location;
      this.stock = stock;
      this.last_odoo_sync = new Date();

      await this.save();

      // Log de auditoría para cambios
      const { auditLogger } = await import("../utils/audit-logger");
      await auditLogger.logColocacionUpdate(userId, this.id, {
        barcode: this.barcode,
        reference: this.reference,
        oldLocation,
        newLocation: location,
        oldStock,
        newStock: stock,
      });

      return true;
    } catch (error) {
      return false;
    }
  }
}

Product.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    barcode: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
        len: [8, 50], // EAN13 mínimo 13, DUN14 14, pero permitimos flexibilidad
      },
    },
    reference: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    location: {
      type: DataTypes.STRING(10),
      allowNull: true,
      validate: {
        is: /^[A-Z]\d{2}[0-5]$/, // Formato: A213 (letra + 2 dígitos + 0-5)
      },
    },
    stock: {
      type: DataTypes.DECIMAL(10, 3), // Permite decimales con 3 decimales
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    status: {
      type: DataTypes.ENUM("active", "inactive"),
      allowNull: false,
      defaultValue: "active",
    },
    odoo_product_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    last_odoo_sync: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "products",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      {
        unique: true,
        fields: ["barcode"],
      },
      {
        unique: true,
        fields: ["odoo_product_id"],
      },
      {
        fields: ["location"],
      },
      {
        fields: ["status"],
      },
    ],
  }
);

export default Product;
export { ProductAttributes, ProductCreationAttributes };
