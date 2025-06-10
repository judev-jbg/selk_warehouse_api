// src/models/ProductLocation.ts
import { Model, DataTypes, Optional } from "sequelize";
import sequelize from "../config/database";

interface ProductLocationAttributes {
  id: string;
  product_id: string;
  old_location: string | null;
  new_location: string | null;
  changed_by: string;
  change_reason: string | null;
  created_at: Date;
}

interface ProductLocationCreationAttributes
  extends Optional<ProductLocationAttributes, "id" | "created_at"> {}

class ProductLocation
  extends Model<ProductLocationAttributes, ProductLocationCreationAttributes>
  implements ProductLocationAttributes
{
  public id!: string;
  public product_id!: string;
  public old_location!: string | null;
  public new_location!: string | null;
  public changed_by!: string;
  public change_reason!: string | null;
  public created_at!: Date;
}

ProductLocation.init(
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
    old_location: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    new_location: {
      type: DataTypes.STRING(10),
      allowNull: true,
      validate: {
        is: /^[A-Z]\d{2}[0-5]$/, // Formato: A213
      },
    },
    changed_by: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users_app",
        key: "id",
      },
    },
    change_reason: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "product_locations",
    timestamps: false,
    indexes: [
      {
        fields: ["product_id"],
      },
      {
        fields: ["changed_by"],
      },
      {
        fields: ["created_at"],
      },
    ],
  }
);

export default ProductLocation;
export { ProductLocationAttributes, ProductLocationCreationAttributes };
