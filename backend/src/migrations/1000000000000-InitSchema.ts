import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1000000000000 implements MigrationInterface {
  name = 'InitSchema1000000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customers" (
        "id"         BIGSERIAL    NOT NULL,
        "name"       VARCHAR      NOT NULL,
        "email"      VARCHAR      NOT NULL,
        "phone"      VARCHAR,
        "address"    TEXT,
        "created_at" TIMESTAMP    NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP    NOT NULL DEFAULT now(),
        CONSTRAINT "pk_customers" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "index_customers_on_email"
      ON "customers" ("email")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "products" (
        "id"             BIGSERIAL        NOT NULL,
        "name"           VARCHAR          NOT NULL,
        "description"    TEXT,
        "price"          NUMERIC(10, 2)   NOT NULL,
        "stock_quantity" INTEGER          NOT NULL DEFAULT 0,
        "category"       VARCHAR,
        "created_at"     TIMESTAMP        NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMP        NOT NULL DEFAULT now(),
        CONSTRAINT "pk_products" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "orders" (
        "id"          BIGSERIAL        NOT NULL,
        "customer_id" BIGINT           NOT NULL,
        "status"      INTEGER          NOT NULL DEFAULT 0,
        "total_price" NUMERIC(10, 2)   NOT NULL DEFAULT 0.0,
        "created_at"  TIMESTAMP        NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP        NOT NULL DEFAULT now(),
        CONSTRAINT "pk_orders" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'fk_orders_customer_id'
            AND table_name = 'orders'
        ) THEN
          ALTER TABLE "orders"
            ADD CONSTRAINT "fk_orders_customer_id"
            FOREIGN KEY ("customer_id") REFERENCES "customers" ("id");
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_items" (
        "id"         BIGSERIAL        NOT NULL,
        "order_id"   BIGINT           NOT NULL,
        "product_id" BIGINT           NOT NULL,
        "quantity"   INTEGER          NOT NULL,
        "unit_price" NUMERIC(10, 2)   NOT NULL,
        "created_at" TIMESTAMP        NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP        NOT NULL DEFAULT now(),
        CONSTRAINT "pk_order_items" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'fk_order_items_order_id'
            AND table_name = 'order_items'
        ) THEN
          ALTER TABLE "order_items"
            ADD CONSTRAINT "fk_order_items_order_id"
            FOREIGN KEY ("order_id") REFERENCES "orders" ("id");
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'fk_order_items_product_id'
            AND table_name = 'order_items'
        ) THEN
          ALTER TABLE "order_items"
            ADD CONSTRAINT "fk_order_items_product_id"
            FOREIGN KEY ("product_id") REFERENCES "products" ("id");
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "index_order_items_on_order_id" ON "order_items" ("order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "index_order_items_on_product_id" ON "order_items" ("product_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "index_order_items_on_order_id_and_product_id" ON "order_items" ("order_id", "product_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "index_orders_on_customer_id" ON "orders" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "index_orders_on_status" ON "orders" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "index_orders_on_created_at" ON "orders" ("created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "index_products_on_name" ON "products" ("name")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "index_products_on_category" ON "products" ("category")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "index_products_on_category"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "index_products_on_name"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "index_orders_on_created_at"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "index_orders_on_status"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "index_orders_on_customer_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "index_order_items_on_order_id_and_product_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "index_order_items_on_product_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "index_order_items_on_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "fk_order_items_product_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "fk_order_items_order_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "order_items"`);
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "fk_orders_customer_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "index_customers_on_email"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customers"`);
  }
}
