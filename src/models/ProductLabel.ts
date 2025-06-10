// src/models/ProductLabel.ts
import { Model, DataTypes, Optional } from "sequelize";
import sequelize from "../config/database";
import Product from "./Product";

interface ProductLabelAttributes {
  id: string;
  product_id: string;
  barcode: string;
  reference: string;
  description: string;
  location: string;
  created_by: string;
  device_identifier: string;
  is_printed: boolean;
  printed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface ProductLabelCreationAttributes
  extends Optional<
    ProductLabelAttributes,
    "id" | "is_printed" | "printed_at" | "created_at" | "updated_at"
  > {}

class ProductLabel
  extends Model<ProductLabelAttributes, ProductLabelCreationAttributes>
  implements ProductLabelAttributes
{
  public id!: string;
  public product_id!: string;
  public barcode!: string;
  public reference!: string;
  public description!: string;
  public location!: string;
  public created_by!: string;
  public device_identifier!: string;
  public is_printed!: boolean;
  public printed_at!: Date | null;
  public created_at!: Date;
  public updated_at!: Date;

  // Método para marcar como impresa
  public async markAsPrinted(): Promise<void> {
    this.is_printed = true;
    this.printed_at = new Date();
    await this.save();
  }

  // Método para generar datos de la etiqueta para impresión
  public getLabelData(): object {
    return {
      reference: this.reference,
      description: this.description,
      location: this.location,
      barcode: this.barcode,
    };
  }
}

ProductLabel.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    product_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "products",
        key: "id",
      },
    },
    barcode: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    reference: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    location: {
      type: DataTypes.STRING(10),
      allowNull: false,
      validate: {
        is: /^[A-Z]\d{2}[0-5]$/, // Formato: A213
      },
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users_app",
        key: "id",
      },
    },
    device_identifier: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    is_printed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    printed_at: {
      type: DataTypes.DATE,
      allowNull: true,
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
  },
  {
    sequelize,
    tableName: "product_labels",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      {
        unique: true,
        fields: ["product_id", "created_by"], // Una etiqueta por producto por usuario
      },
      {
        fields: ["created_by"],
      },
      {
        fields: ["device_identifier"],
      },
      {
        fields: ["is_printed"],
      },
    ],
  }
);

ProductLabel.belongsTo(Product, {
  foreignKey: "product_id",
  as: "product",
});

export default ProductLabel;
export { ProductLabelAttributes, ProductLabelCreationAttributes };
