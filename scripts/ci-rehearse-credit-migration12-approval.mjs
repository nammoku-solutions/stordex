/* eslint-disable no-console */
/**
 * FOLLOW-UP to ci-rehearse-credit-migration12.mjs.
 * Creates fully synthetic B2B orders, inspected returns, and DRAFT credit
 * records in an ephemeral GitHub Actions PostgreSQL database only.
 * An accepted AUDIT RECORD is not CreditNote approval/issuance/settlement.
 */
import assert from "node:assert/strict";
import pg from "pg";
const parsed = new URL(process.env.DATABASE_URL || "postgresql://invalid.invalid/no");
if (
  process.env.CI !== "true" ||
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.APP_ENV !== "ci" ||
  parsed.hostname !== "localhost" ||
  parsed.port !== "5432" ||
  parsed.pathname !== "/stordex" ||
  parsed.searchParams.toString() !== "schema=public" ||
  !["postgres:", "postgresql:"].includes(parsed.protocol)
) throw Error("Refusing approval rehearsal outside disposable local GitHub Actions PostgreSQL");
const connectionString = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString });
const prefix = "ci-m12-";
const seller = prefix+"seller", buyer=prefix+"foreign", maker=prefix+"maker";
const checker=prefix+"checker", reviewer=prefix+"reviewer", buyerAdmin=prefix+"foreign-admin";
const invoiceId=prefix+"invoice", invoiceHash="ab".repeat(32);
const documentHash="cd".repeat(32), amountHash="ef".repeat(32);
const id = name => prefix+name;
const uid = i => "22222222-2222-4222-8222-" + String(i).padStart(12,"0");
let assertions=0;
async function reject(query, args, label, expected = /./) {
  await assert.rejects(client.query(query,args),expected,label);
  assertions++;
}
async function checkScalar(query, args, expected, label) {
  const r=await client.query(query,args);
  assert.equal(r.rows[0]?.v,expected,label);
  assertions++;
}
async function syntheticReturnCredit(suffix,quantity) {
  const request = id("return-"+suffix), item = id("return-item-"+suffix);
  const movement=id("dispatch-movement-"+suffix), credit=id("credit-"+suffix);
  await client.query(
    'INSERT INTO "B2BReturnRequest" ("id","intercompanyOrderId","buyerTenantId",' +
    '"sellerTenantId","requestNumber","status","requestedByUserId","updatedAt")' +
    " VALUES ($1,$2,$3,$4,$5,'APPROVED',$6,now())",
    [request,id("company-order"),buyer,seller,"CI-RETURN-"+suffix,buyerAdmin],
  );
  await client.query(
    'INSERT INTO "B2BReturnItem" ("id","returnRequestId","intercompanyOrderId",' +
    '"sourceLineId","requestedQuantity","approvedQuantity","reason")' +
    " VALUES ($1,$2,$3,$4,$5,$5,'DAMAGED')",
    [item,request,id("company-order"),id("company-line"),quantity],
  );
  await client.query(
    'INSERT INTO "InventoryMovement" ("id","tenantId","itemId","type","quantity",' +
    '"balance","createdBy") VALUES ($1,$2,$3,\'OUTBOUND\',$4,$5,$6)',
    [movement,buyer,id("buyer-item"),quantity,5-quantity,buyerAdmin],
  );
  await client.query(
    'INSERT INTO "B2BReturnStockEvent" ("id","returnItemId","tenantId","phase",' +
    '"eventId","payloadHash","quantity","saleable","unsaleable","movementId",' +
    '"createdByUserId") VALUES ($1,$2,$3,\'DISPATCH\',$4,$5,$6,0,0,$7,$8)',
    [id("dispatch-"+suffix),item,buyer,uid(suffix*10+1),
     invoiceHash,quantity,movement,buyerAdmin],
  );
  await client.query(
    'UPDATE "B2BReturnRequest" SET status=\'DISPATCHED\' WHERE id=$1',[request],
  );
  await client.query(
    'INSERT INTO "B2BReturnStockEvent" ("id","returnItemId","tenantId","phase",' +
    '"eventId","payloadHash","quantity","saleable","unsaleable","createdByUserId")' +
    " VALUES ($1,$2,$3,'INSPECTION',$4,$5,$6,0,$6,$7)",
    [id("inspection-"+suffix),item,seller,uid(suffix*10+2),
     invoiceHash,quantity,reviewer],
  );
  await client.query(
    'UPDATE "B2BReturnRequest" SET status=\'INSPECTED\' WHERE id=$1',[request],
  );
  await client.query(
    'INSERT INTO "B2BCreditNote" ("id","sellerTenantId","originalInvoiceId",' +
    '"sellerOrderId","returnRequestId","creditNoteNumber","currencyCode",' +
    '"status","originalInvoiceSubtotal","originalInvoiceTax","originalInvoiceTotal",' +
    '"originalInvoiceTaxRate","originalInvoiceTaxPerOrder","createdByUserId","updatedAt")' +
    " VALUES ($1,$2,$3,$4,$5,$6,'JPY','DRAFT',4400,440,4840,10,false,$7,now())",
    [credit,seller,invoiceId,id("seller-order"),request,"CI-CREDIT-"+suffix,maker],
  );
  await client.query(
    'INSERT INTO "B2BCreditNoteLine" ("id","creditNoteId","returnRequestId",' +
    '"returnItemId","creditedQuantity") VALUES ($1,$2,$3,$4,$5)',
    [id("credit-line-"+suffix),credit,request,item,quantity],
  );
  const evidence=id("approved-evidence-"+suffix);
  await client.query(
    'INSERT INTO "B2BInvoiceCurrencyEvidence" (' +
    '"id","sellerTenantId","invoiceId","sourceInvoiceNumber","documentObjectRef",' +
    '"documentSha256","invoiceSnapshotSha256","documentExplicitCurrencyCode",' +
    '"submittedByUserId") VALUES ($1,$2,$3,$4,$5,$6,$7,\'JPY\',$8)',
    [evidence,seller,invoiceId,"CI-INV-0001",
      "private://original-invoice/ci-review-"+suffix,
      documentHash,invoiceHash,maker],
  );
  await client.query(
    'INSERT INTO "B2BInvoiceCurrencyEvidenceEvent" ("id","evidenceId",' +
    '"sellerTenantId","eventId","eventType","reviewerUserId",' +
    '"observedDocumentSha256","observedInvoiceSnapshotSha256","reason")' +
    " VALUES ($1,$2,$3,$4,'VERIFIED',$5,$6,$7,$8)",
    [id("approved-verified-"+suffix),evidence,seller,uid(suffix*10+3),
      checker,documentHash,invoiceHash,
      "Independently reviewed original CI invoice bytes (synthetic only)"],
  );
  return { credit, evidence, quantity };
}
const insertApproval = 'INSERT INTO "B2BCreditApprovalReviewEvent" ('+
  '"id","eventId","creditNoteId","invoiceId","sellerTenantId","evidenceId",'+
  '"reviewerUserId","accountingVerifierUserId","eventType",'+
  '"invoiceSnapshotSha256","computedAmountsSha256","candidateSubtotal",'+
  '"candidateTax","candidateTotal","reason") VALUES '+
  "($1,$2,$3,$4,$5,$6,$7,$8,'REVIEW_ACCEPTED',$9,$10,$11,$12,$13,$14)";
function approvalArgs(suffix,fixture,overrides={}) {
  const net=fixture.quantity*880, tax=fixture.quantity*88;
  const args=[id("approved-credit-event-"+suffix),uid(suffix*10+4),
    fixture.credit,invoiceId,seller,fixture.evidence,
    reviewer,checker,invoiceHash,amountHash,
    net,tax,net+tax,"Independent accounting check for CI-only hypothetical credit"];
  for(const [i,val] of Object.entries(overrides))args[Number(i)]=val;
  return args;
}
const insertRevocation = 'INSERT INTO "B2BInvoiceCurrencyEvidenceEvent" ('+
  '"id","evidenceId","sellerTenantId","eventId","eventType","reviewerUserId",'+
  '"observedDocumentSha256","observedInvoiceSnapshotSha256","reason") VALUES '+
  "($1,$2,$3,$4,'REVOKED',$5,$6,$7,$8)";
function revocationArgs(suffix,evidence) {
  return [id("revoked-"+suffix),evidence,seller,uid(suffix*10+5),
    checker,documentHash,invoiceHash,
    "Evidence no longer trustworthy, revoke for CI race test"];
}
async function connection() {
  const c=new pg.Client({connectionString});
  await c.connect();
  await c.query("SET statement_timeout='8000ms'");
  return c;
}
try {
  await client.connect();
  const state=(await client.query(
    "SELECT current_database() AS db,current_setting('neon.project_id',true) AS neon,"+
    "(SELECT count(*)::int FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL) AS migrations,"+
    "(SELECT count(*)::int FROM \"B2BInvoiceCurrencyEvidenceEvent\") AS evidence_events",
  )).rows[0];
  assert.equal(state.db,"stordex");
  assert.equal(state.neon,null);
  assert.equal(state.migrations,11);
  assert.ok(state.evidence_events>=2,"CI must run prerequisite ledger rehearsal first");

  await client.query(
    'INSERT INTO "Supplier" ("id","tenantId","code","name","updatedAt")'+
    " VALUES ($1,$2,'CI-SUP','Synthetic supplier',now())",
    [id("supplier"),buyer],
  );
  await client.query(
    'INSERT INTO "Item" ("id","tenantId","code","name","unit","stock","updatedAt")'+
    " VALUES ($1,$2,'B-ITEM','Synthetic buyer product','box',5,now()),"+
    "($3,$4,'S-ITEM','Synthetic seller product','box',5,now())",
    [id("buyer-item"),buyer,id("seller-item"),seller],
  );
  await client.query(
    'INSERT INTO "PurchaseOrder" ("id","tenantId","poNumber","supplierId",'+
    '"status","subtotal","tax","total","updatedAt")'+
    " VALUES ($1,$2,'CI-PO-1',$3,'RECEIVED',4400,440,4840,now())",
    [id("purchase-order"),buyer,id("supplier")],
  );
  await client.query(
    'INSERT INTO "PurchaseOrderItem" ("id","purchaseOrderId","itemId",'+
    '"itemName","unit","quantity","unitPrice","amount","received")'+
    " VALUES ($1,$2,$3,'Synthetic product','box',5,880,4400,5)",
    [id("purchase-line"),id("purchase-order"),id("buyer-item")],
  );
  await client.query(
    'INSERT INTO "Order" ("id","tenantId","orderNumber","customerId","status",'+
    '"subtotal","taxRate","tax","total","updatedAt")'+
    " VALUES ($1,$2,'CI-SO-1',$3,'SHIPPED',4400,10,440,4840,now())",
    [id("seller-order"),seller,id("customer")],
  );
  await client.query(
    'INSERT INTO "OrderItem" ("id","orderId","itemId","itemName","unit",'+
    '"quantity","unitPrice","amount") VALUES '+
    "($1,$2,$3,'Synthetic product','box',5,880,4400)",
    [id("seller-line"),id("seller-order"),id("seller-item")],
  );
  await client.query(
    'INSERT INTO "InvoiceOrder" ("invoiceId","orderId") VALUES ($1,$2)',
    [invoiceId,id("seller-order")],
  );
  // tenantA < tenantB lexicographically for the existing DB constraint.
  await client.query(
    'INSERT INTO "TradingConnection" ("id","tenantAId","tenantBId",'+
    '"requestedByTenantId","status","updatedAt") VALUES '+
    "($1,$2,$3,$2,'ACTIVE',now())",
    [id("connection"),buyer,seller],
  );
  await client.query(
    'INSERT INTO "IntercompanyOrder" ("id","connectionId","buyerTenantId",'+
    '"sellerTenantId","purchaseOrderId","sellerOrderId","poNumber","orderDate",'+
    '"subtotal","taxRate","tax","total","status","updatedAt") VALUES '+
    "($1,$2,$3,$4,$5,$6,'CI-PO-1',now(),4400,10,440,4840,'ACCEPTED',now())",
    [id("company-order"),id("connection"),buyer,seller,
      id("purchase-order"),id("seller-order")],
  );
  await client.query(
    'INSERT INTO "IntercompanyOrderItem" ("id","intercompanyOrderId",'+
    '"sourcePurchaseOrderItemId","sellerOrderItemId","buyerItemCode",'+
    '"itemName","unit","quantity","unitPrice","amount") VALUES '+
    "($1,$2,$3,$4,'B-ITEM','Synthetic product','box',5,880,4400)",
    [id("company-line"),id("company-order"),id("purchase-line"),id("seller-line")],
  );

  const valid=await syntheticReturnCredit(20,2);
  assert.equal((await client.query(
    'SELECT status::text AS v FROM "B2BReturnRequest" WHERE id=$1',
    [id("return-20")],
  )).rows[0].v,"INSPECTED");
  assertions++;
  // These adversarial checks MUST run before the positive review. After a
  // review, a uniqueness failure would mask a broken maker/checker guard.
  await reject(
    insertApproval,approvalArgs(20,valid,{6:maker,0:id("self-review")}),
    "maker cannot approve own CreditNote",
    /Credit review requires independent active seller managers/,
  );
  await reject(
    insertApproval,approvalArgs(20,valid,{7:maker,0:id("self-accountant")}),
    "maker cannot provide own accounting signoff",
    /Credit review requires independent active seller managers/,
  );
  await reject(
    insertApproval,approvalArgs(20,valid,{6:buyerAdmin,0:id("cross-tenant")}),
    "foreign tenant cannot review seller CreditNote",
    /Credit review requires independent active seller managers/,
  );
  await reject(
    insertApproval,approvalArgs(20,valid,{10:4800,11:480,12:5280,0:id("over-cap")}),
    "review gross must not exceed original seller invoice",
    /Credit review requires unchanged issued invoice financial snapshot and cap/,
  );
  // A source Invoice may have been altered since the immutable DRAFT snapshot.
  // Proposal SQL now detects this; restore ONLY synthetic CI Invoice afterward.
  await client.query(
    'UPDATE "Invoice" SET subtotal=4399,total=4839 WHERE id=$1',
    [invoiceId],
  );
  await reject(
    insertApproval,approvalArgs(20,valid,{0:id("stale-source")}),
    "original source Invoice financial change must block review",
    /Credit review requires unchanged issued invoice financial snapshot and cap/,
  );
  await client.query(
    'UPDATE "Invoice" SET subtotal=4400,total=4840 WHERE id=$1',
    [invoiceId],
  );
  await client.query(insertApproval,approvalArgs(20,valid));
  await checkScalar(
    'SELECT count(*)::int AS v FROM "B2BCreditApprovalReviewEvent" WHERE "creditNoteId"=$1',
    [valid.credit],1,"valid audited review must be recorded once",
  );
  await checkScalar(
    'SELECT count(*)::int AS v FROM "B2BCreditNote" '+
    'WHERE id=$1 AND status=\'DRAFT\' AND "proposedTotal" IS NULL',
    [valid.credit],1,"approved audit must NOT change CreditNote or amounts",
  );
  await checkScalar(
    'SELECT count(*)::int AS v FROM "Invoice" '+
    'WHERE id=$1 AND status=\'ISSUED\' AND total=4840',
    [invoiceId],1,"review must NOT mutate original issued Invoice",
  );
  await reject(
    'UPDATE "B2BCreditApprovalReviewEvent" SET "reason"=$1 WHERE "creditNoteId"=$2',
    ["TAMPER",valid.credit],"accepted review audit must be immutable",
  );
  await reject(
    'DELETE FROM "B2BCreditApprovalReviewEvent" WHERE "creditNoteId"=$1',
    [valid.credit],"accepted review audit cannot be deleted",
  );

  const revFirst=await syntheticReturnCredit(21,1);
  const revConn=await connection(),approveConn=await connection();
  try {
    await revConn.query("BEGIN");
    // Reserve this evidence row until the revocation has committed.
    await revConn.query(
      'SELECT id FROM "B2BInvoiceCurrencyEvidence" WHERE id=$1 FOR UPDATE',
      [revFirst.evidence],
    );
    const attempt=assert.rejects(
      approveConn.query(insertApproval,approvalArgs(21,revFirst)),
      /Credit review requires verified and non-revoked JPY evidence/,
      "review waiting behind revocation must fail closed",
    );
    await revConn.query(insertRevocation,revocationArgs(21,revFirst.evidence));
    await revConn.query("COMMIT");
    await attempt;
    assertions++;
    await checkScalar(
      'SELECT count(*)::int AS v FROM "B2BCreditApprovalReviewEvent" WHERE "creditNoteId"=$1',
      [revFirst.credit],0,"revoked evidence never authorizes a new review",
    );
  } finally {
    await revConn.query("ROLLBACK").catch(()=>{});
    await Promise.all([revConn.end(),approveConn.end()]);
  }

  const approveFirst=await syntheticReturnCredit(22,1);
  const approve=await connection(),revoke=await connection();
  try {
    await approve.query("BEGIN");
    // This lock is also taken inside the future review trigger, ensuring
    // revocation cannot be interleaved mid-approval transaction.
    await approve.query(
      'SELECT id FROM "B2BInvoiceCurrencyEvidence" WHERE id=$1 FOR UPDATE',
      [approveFirst.evidence],
    );
    const attemptedRevoke=revoke.query(
      insertRevocation,revocationArgs(22,approveFirst.evidence),
    );
    await approve.query(insertApproval,approvalArgs(22,approveFirst));
    await approve.query("COMMIT");
    await attemptedRevoke;
    await checkScalar(
      'SELECT count(*)::int AS v FROM "B2BCreditApprovalReviewEvent" WHERE "creditNoteId"=$1',
      [approveFirst.credit],1,"historical review persists when evidence revoked afterwards",
    );
    await checkScalar(
      'SELECT count(*)::int AS v FROM "B2BInvoiceCurrencyEvidenceEvent" '+
      'WHERE "evidenceId"=$1 AND "eventType"=\'REVOKED\'',
      [approveFirst.evidence],1,"revocation remains auditable",
    );
    // A historical accepted review with subsequently revoked evidence is
    // NOT an authorization for credit issuing. Financial writer doesn't exist.
    await reject(
      insertApproval,approvalArgs(22,approveFirst,{0:id("second-approval"),1:uid(224)}),
      "approval audit cannot be reused or silently re-approved after revocation",
    );
  } finally {
    await approve.query("ROLLBACK").catch(()=>{});
    await Promise.all([approve.end(),revoke.end()]);
  }

  // Race C: an Invoice financial update commits before a review can take a
  // SHARE lock. The review must reject the stale immutable CreditNote snapshot.
  const invoiceChangedFirst=await syntheticReturnCredit(23,1);
  const changing=await connection(),reviewing=await connection();
  try {
    await changing.query("BEGIN");
    await changing.query(
      'UPDATE "Invoice" SET subtotal=4397,total=4837 WHERE id=$1',
      [invoiceId],
    );
    const pending=assert.rejects(
      reviewing.query(insertApproval,approvalArgs(23,invoiceChangedFirst)),
      /Credit review requires unchanged issued invoice financial snapshot and cap/,
      "review must fail after concurrent Invoice amount change commits",
    );
    await changing.query("COMMIT");
    await pending;
    assertions++;
    await checkScalar(
      'SELECT count(*)::int AS v FROM "B2BCreditApprovalReviewEvent" WHERE "creditNoteId"=$1',
      [invoiceChangedFirst.credit],0,
      "stale source update cannot create a review event",
    );
    await client.query(
      'UPDATE "Invoice" SET subtotal=4400,total=4840 WHERE id=$1',
      [invoiceId],
    );
  } finally {
    await changing.query("ROLLBACK").catch(()=>{});
    await Promise.all([changing.end(),reviewing.end()]);
  }

  // Race D: a review first pins the original Invoice snapshot FOR SHARE.
  // Concurrent editing the Invoice must wait (and fail lock_timeout in this
  // deterministic CI check), rather than interleave in the review.
  const reviewedFirst=await syntheticReturnCredit(24,1);
  const reviewingFirst=await connection(),editingLater=await connection();
  try {
    await reviewingFirst.query("BEGIN");
    await reviewingFirst.query(
      'SELECT id FROM "Invoice" WHERE id=$1 FOR SHARE',
      [invoiceId],
    );
    await reviewingFirst.query(insertApproval,approvalArgs(24,reviewedFirst));
    await editingLater.query("SET lock_timeout='300ms'");
    await assert.rejects(
      editingLater.query(
        'UPDATE "Invoice" SET subtotal=4395,total=4835 WHERE id=$1',
        [invoiceId],
      ),
      error => error?.code==="55P03",
      "concurrent Invoice edit must be blocked until review commit",
    );
    assertions++;
    await reviewingFirst.query("COMMIT");
    await checkScalar(
      'SELECT count(*)::int AS v FROM "B2BCreditApprovalReviewEvent" WHERE "creditNoteId"=$1',
      [reviewedFirst.credit],1,
      "review-first immutable audit persists before invoice edits",
    );
    await client.query(
      'UPDATE "Invoice" SET subtotal=4395,total=4835 WHERE id=$1',
      [invoiceId],
    );
    await checkScalar(
      'SELECT count(*)::int AS v FROM "B2BCreditNote" cn JOIN "Invoice" i '+
      'ON i.id=cn."originalInvoiceId" WHERE cn.id=$1 '+
      'AND (cn."originalInvoiceSubtotal"<>i.subtotal OR '+
      'cn."originalInvoiceTotal"<>i.total)',
      [reviewedFirst.credit],1,
      "later Invoice edit invalidates previous approval for any future posting",
    );
    await client.query(
      'UPDATE "Invoice" SET subtotal=4400,total=4840 WHERE id=$1',
      [invoiceId],
    );
  } finally {
    await reviewingFirst.query("ROLLBACK").catch(()=>{});
    await Promise.all([reviewingFirst.end(),editingLater.end()]);
  }

  // Status-only changes are equally sensitive for future monetary posting.
  const statusChanged=await syntheticReturnCredit(25,1);
  await client.query('UPDATE "Invoice" SET status=\'CANCELLED\' WHERE id=$1',[invoiceId]);
  await reject(
    insertApproval,approvalArgs(25,statusChanged),
    "cancelled original Invoice must block a new review",
    /Credit review requires unchanged issued invoice financial snapshot and cap/,
  );
  await client.query('UPDATE "Invoice" SET status=\'ISSUED\' WHERE id=$1',[invoiceId]);

  // CI ONLY: test the historical 2-box VOID allocation release separately
  // from real Staging UAT. Generate two independent inspected return lines.
  const f26=await syntheticReturnCredit(26,2);
  const f27=await syntheticReturnCredit(27,2);
  const beforeReallocMovements=Number((await client.query(
    'SELECT count(*)::int AS n FROM "InventoryMovement"',
  )).rows[0].n);
  async function replacementDraft(suffix,kind) {
    const credit=id("replacement-"+suffix+"-"+kind);
    await client.query(
      'INSERT INTO "B2BCreditNote" ("id","sellerTenantId","originalInvoiceId",'+
      '"sellerOrderId","returnRequestId","creditNoteNumber","currencyCode",'+
      '"status","originalInvoiceSubtotal","originalInvoiceTax","originalInvoiceTotal",'+
      '"originalInvoiceTaxRate","originalInvoiceTaxPerOrder","createdByUserId","updatedAt")'+
      " VALUES ($1,$2,$3,$4,$5,$6,'JPY','DRAFT',4400,440,4840,10,false,$7,now())",
      [credit,seller,invoiceId,id("seller-order"),id("return-"+suffix),
        "CI-REPLACEMENT-"+suffix+"-"+kind,maker],
    );
    return credit;
  }
  const insertAllocation='INSERT INTO "B2BCreditNoteLine" ('+
    '"id","creditNoteId","returnRequestId","returnItemId","creditedQuantity") '+
    'VALUES ($1,$2,$3,$4,$5)';
  const allocArgs=(suffix,credit,kind)=>[
    id("replacement-line-"+suffix+"-"+kind),
    credit,id("return-"+suffix),id("return-item-"+suffix),2,
  ];
  async function voidOriginal(suffix,original){
    await client.query(
      'UPDATE "B2BCreditNote" SET status=\'VOID\',"voidEventId"=$1,'+
      '"voidedByUserId"=$2,"voidReason"=$3 WHERE id=$4',
      [uid(suffix*10+9),checker,"VOID to release inspected reallocation budget in CI only",original.credit],
    );
    await checkScalar(
      'SELECT count(*)::int AS v FROM "B2BCreditNote" '+
      "WHERE id=$1 AND status='VOID' AND \"voidedAt\" IS NOT NULL "+
      'AND "proposedTotal" IS NULL',[original.credit],1,
      "VOID original keeps historical note without amounts",
    );
    await checkScalar(
      'SELECT count(*)::int AS v FROM "B2BCreditVoidEvent" WHERE "creditNoteId"=$1',
      [original.credit],1,"exactly one VOID audit event",
    );
  }
  const candidate=await replacementDraft(26,"single");
  await reject(
    insertAllocation,allocArgs(26,candidate,"single"),
    "no allocation of already-reserved 2 units before VOID",
    /Credit draft allocation exceeds physically inspected unallocated returns/,
  );
  await voidOriginal(26,f26);
  await client.query(insertAllocation,allocArgs(26,candidate,"single"));
  await checkScalar(
    'SELECT count(*)::int AS v FROM "B2BCreditNoteLine" '+
    'WHERE "creditNoteId"=$1 AND "creditedQuantity"=2',
    [f26.credit],1,"original two-unit allocation history retained",
  );
  await checkScalar(
    'SELECT coalesce(sum(l."creditedQuantity"),0)::int AS v '+
    'FROM "B2BCreditNoteLine" l JOIN "B2BCreditNote" cn ON cn.id=l."creditNoteId" '+
    'WHERE l."returnItemId"=$1 AND cn.status<>\'VOID\'',
    [id("return-item-26")],2,
    "released two units are available to a replacement DRAFT",
  );
  await reject(
    'DELETE FROM "B2BCreditNoteLine" WHERE "creditNoteId"=$1',
    [f26.credit],"VOID historical lines cannot be deleted",
    /B2B credit draft allocation lines cannot be deleted/,
  );

  // Two different replacement draft writers race on the same 2-unit budget.
  await voidOriginal(27,f27);
  const a=await replacementDraft(27,"A"),b=await replacementDraft(27,"B");
  const clients=[await connection(),await connection()];
  try {
    const outcomes=await Promise.allSettled([
      clients[0].query(insertAllocation,allocArgs(27,a,"A")),
      clients[1].query(insertAllocation,allocArgs(27,b,"B")),
    ]);
    assert.equal(outcomes.filter(o=>o.status==="fulfilled").length,1,
      "only one replacement writer can reserve the inspected two units");
    const failed=outcomes.find(o=>o.status==="rejected");
    assert.ok(failed,"one competing writer must be rejected");
    assert.match(String(failed.reason?.message??""),
      /Credit draft allocation exceeds physically inspected unallocated returns/);
    assertions++;
    await checkScalar(
      'SELECT coalesce(sum(l."creditedQuantity"),0)::int AS v '+
      'FROM "B2BCreditNoteLine" l JOIN "B2BCreditNote" cn ON cn.id=l."creditNoteId" '+
      'WHERE l."returnItemId"=$1 AND cn.status<>\'VOID\'',
      [id("return-item-27")],2,
      "concurrent replacement allocations cannot exceed inspected quantity",
    );
  } finally {
    await Promise.all(clients.map(c=>c.end().catch(()=>{})));
  }
  await checkScalar(
    'SELECT count(*)::int AS v FROM "InventoryMovement"',[],
    beforeReallocMovements,"VOID/reallocation must not create inventory movement",
  );
  await checkScalar(
    'SELECT count(*)::int AS v FROM "Invoice" '+
    "WHERE id=$1 AND status='ISSUED' AND subtotal=4400 AND tax=440 AND total=4840",
    [invoiceId],1,"original invoice must be unchanged",
  );
  await checkScalar(
    'SELECT count(*)::int AS v FROM "B2BCreditNoteLine" '+
    'WHERE "proposedSubtotal" IS NOT NULL OR "proposedTax" IS NOT NULL '+
    'OR "proposedTotal" IS NOT NULL',[],0,
    "reallocation must not persist any line monetary amounts",
  );
  console.log("PASS: 2-box VOID history and replacement DRAFT, competing writers serialized without stock/invoice changes");

  // No real invoice posting or stored money is allowed; source invoice cap
  // and immutable original-value snapshots remain separate approval gates.
  await checkScalar(
    'SELECT count(*)::int AS v FROM "B2BCreditNote" WHERE "proposedTotal" IS NOT NULL',
    [],0,"no financial proposal amount persisted from audit rehearsals",
  );
  await checkScalar(
    'SELECT count(*)::int AS v FROM "B2BCreditNote" WHERE status NOT IN (\'DRAFT\',\'VOID\')',
    [],0,"no issued/applied CreditNote exists in disposable CI database",
  );
  await checkScalar(
    'SELECT count(*)::int AS v FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
    [],11,"draft migration never installed into Prisma migration history",
  );
  console.log("PASS: "+assertions+" positive CreditNote audit, review-vs-revocation, tenant, and non-posting assertions");
  console.log("PASS: all financial posting remains disabled; Neon Staging was not connected");
} finally {
  await client.end().catch(()=>{});
}
