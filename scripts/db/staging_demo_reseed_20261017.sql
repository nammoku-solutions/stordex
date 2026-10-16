-- Stordex UAT fixture 2026-10-17. Only execute each STMT in ONE database transaction.
-- Preserves Tenant and User rows, including password hashes and roles.
-- Deliberately refuses to run against Neon's production/default branch.
-- DO NOT run via a regular app migration: this is explicitly destructive demo cleanup.
-- STMT
DO $guard$
BEGIN
  IF current_setting('neon.project_id', true) IS DISTINCT FROM 'dry-feather-14704968'
    OR current_setting('neon.branch_id', true) NOT IN
       ('br-still-leaf-aovmdbnc', 'br-sparkling-boat-ao9nrctp') THEN
    RAISE EXCEPTION 'STOP: invalid database/project/branch for Stordex UAT reset';
  END IF;
  IF (SELECT COUNT(*) FROM "Tenant") <> 2
     OR (SELECT COUNT(*) FROM "User") <> 2
     OR (SELECT COUNT(DISTINCT slug) FROM "Tenant" WHERE slug IN ('demo','acme')) <> 2
     OR EXISTS (SELECT 1 FROM "Tenant" WHERE slug NOT IN ('demo','acme')) THEN
    RAISE EXCEPTION 'STOP: expected precisely demo and acme tenants with 2 existing users';
  END IF;
END
$guard$;
-- STMT
TRUNCATE TABLE
  "IntercompanyOrderItem", "IntercompanyOrder", "TradingConnection",
  "PurchaseOrderItem", "PurchaseOrder", "OrderItem", "Order",
  "QuotationItem", "Quotation", "InvoiceOrder", "Invoice",
  "InventoryMovement", "Item", "Customer", "Supplier",
  "Warehouse", "BusinessUnit", "ImportJob", "SignupInvitation"
RESTRICT;
-- STMT
INSERT INTO "BusinessUnit" ("id","tenantId","name","isDefault","updatedAt")
SELECT 'uat-' || slug || '-businessunit-main', id, '本社（サンプル）', true, NOW()
FROM "Tenant";
-- STMT
INSERT INTO "Supplier" ("id","tenantId","code","name","active","note","updatedAt")
SELECT 'uat-' || t.slug || '-supplier-' || s.code, t.id,
       CASE WHEN s.code='PARTNER' THEN 'SUP-PARTNER' ELSE 'SUP-OTHER' END,
       CASE WHEN s.code='PARTNER' AND t.slug='demo' THEN 'ACME物流株式会社'
            WHEN s.code='PARTNER' AND t.slug='acme' THEN 'デモ卸売株式会社'
            ELSE '架空テスト仕入先' END,
       true, 'UAT検証専用の架空マスタ', NOW()
FROM "Tenant" t CROSS JOIN (VALUES ('PARTNER'), ('OTHER')) AS s(code);
-- STMT
INSERT INTO "Customer" ("id","tenantId","code","name","active","note","updatedAt")
SELECT 'uat-' || t.slug || '-customer-' || c.code, t.id,
       CASE WHEN c.code='PARTNER' THEN 'CUS-PARTNER' ELSE 'CUS-OTHER' END,
       CASE WHEN c.code='PARTNER' AND t.slug='demo' THEN 'ACME物流株式会社'
            WHEN c.code='PARTNER' AND t.slug='acme' THEN 'デモ卸売株式会社'
            ELSE '架空テスト得意先' END,
       true, 'UAT検証専用の架空マスタ', NOW()
FROM "Tenant" t CROSS JOIN (VALUES ('PARTNER'), ('OTHER')) AS c(code);
-- STMT
INSERT INTO "Item" (
  "id","tenantId","code","name","unit","spec","stock",
  "reorderPoint","costPrice","salesPrice","supplierId",
  "category","active","note","updatedAt"
)
SELECT
  'uat-' || t.slug || '-item-' || i.suffix,
  t.id,
  (CASE WHEN t.slug='demo' THEN 'D-' ELSE 'A-' END) || i.suffix,
  i.name, i.unit, i.spec,
  CASE WHEN t.slug='demo' THEN i.demo_stock ELSE i.acme_stock END,
  CASE WHEN t.slug='demo' THEN i.demo_reorder ELSE i.acme_reorder END,
  CASE WHEN t.slug='demo' THEN i.demo_cost ELSE i.acme_cost END,
  CASE WHEN t.slug='demo' THEN i.demo_sale ELSE i.acme_sale END,
  'uat-' || t.slug || '-supplier-PARTNER',
  '文具（企業間UAT）', true,
  '両社で商品名・単位は一致、商品コードのみ異なる。受注時に自社SKUへ対応付けてください。',
  NOW()
FROM "Tenant" t
CROSS JOIN (
  VALUES
    ('PAPER', 'A4コピー用紙（500枚×5冊）', '箱', 'A4 / 500枚×5冊', 25, 150, 5, 30, 880, 1150, 650, 880),
    ('PEN',   '黒ボールペン（0.5mm）',      '本', '黒 / 0.5mm',       80, 600, 20, 100, 90, 140, 60, 95),
    ('NOTE',  'B5ノート（30枚）',         '冊', 'B5 / 30枚',       40, 300, 10, 60, 150, 240, 110, 155),
    ('FILE',  'A4クリアファイル',         '枚', 'A4 / 透明',       60, 400, 15, 80, 25, 45, 18, 28)
) AS i(suffix,name,unit,spec,demo_stock,acme_stock,demo_reorder,acme_reorder,demo_cost,demo_sale,acme_cost,acme_sale);
-- STMT
INSERT INTO "InventoryMovement"
  ("id","tenantId","itemId","type","quantity","balance","note","createdAt")
SELECT
  'uat-' || t.slug || '-opening-' || i.id,
  i."tenantId", i.id, 'ADJUSTMENT'::"MovementType",
  i.stock, i.stock,
  'UATサンプル初期在庫（履歴整合性確認用）',
  NOW()
FROM "Item" i JOIN "Tenant" t ON i."tenantId"=t.id;
-- STMT
DO $assert$
BEGIN
  IF (SELECT COUNT(*) FROM "Tenant") <> 2
     OR (SELECT COUNT(*) FROM "User") <> 2
     OR (SELECT COUNT(*) FROM "BusinessUnit") <> 2
     OR (SELECT COUNT(*) FROM "Customer") <> 4
     OR (SELECT COUNT(*) FROM "Supplier") <> 4
     OR (SELECT COUNT(*) FROM "Item") <> 8
     OR (SELECT COUNT(*) FROM "InventoryMovement") <> 8
     OR (SELECT COUNT(*) FROM "Order") <> 0
     OR (SELECT COUNT(*) FROM "PurchaseOrder") <> 0
     OR (SELECT COUNT(*) FROM "IntercompanyOrder") <> 0
     OR (SELECT COUNT(*) FROM "TradingConnection") <> 0
     OR EXISTS (
       SELECT 1 FROM "Item" i
       LEFT JOIN "InventoryMovement" m ON m."itemId"=i.id
       GROUP BY i.id, i.stock
       HAVING COUNT(m.id)<>1 OR MAX(m.balance)<>i.stock OR MAX(m.quantity)<>i.stock
     ) THEN
    RAISE EXCEPTION 'STOP: Stordex UAT seed integrity assertion failed';
  END IF;
END
$assert$;
