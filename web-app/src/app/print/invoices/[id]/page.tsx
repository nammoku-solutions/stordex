import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PrintToolbar } from "@/components/PrintToolbar";
import { yen, num, dateJP } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function InvoicePrintPage({ params }: { params: { id: string } }) {
  const { tenantId, session } = await requireTenant();
  const inv = await prisma.invoice.findFirst({
    where: { id: params.id, tenantId },
    include: {
      customer: true,
      businessUnit: true,
      orders: {
        include: {
          order: { include: { items: true } },
        },
      },
    },
  });
  if (!inv) notFound();

  // 明細統合（商品単位で集計）
  const detailMap = new Map<
    string,
    { itemName: string; unit: string; quantity: number; amount: number }
  >();
  for (const io of inv.orders) {
    for (const li of io.order.items) {
      const key = `${li.itemName}::${li.unit}::${li.unitPrice}`;
      const cur = detailMap.get(key);
      if (cur) {
        cur.quantity += li.quantity;
        cur.amount += li.amount;
      } else {
        detailMap.set(key, {
          itemName: li.itemName,
          unit: li.unit,
          quantity: li.quantity,
          amount: li.amount,
        });
      }
    }
  }
  const details = Array.from(detailMap.values());
  const issuer = inv.businessUnit;

  return (
    <>
      <PrintToolbar title={`請求書 ${inv.invoiceNumber}`} />
      <div className="print-sheet">
        <h1 className="print-title">請 求 書</h1>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8mm" }}>
          <div style={{ width: "55%" }}>
            <div style={{ borderBottom: "1.5pt solid #000", paddingBottom: "2mm", fontSize: "13pt" }}>
              {inv.customer.name} 御中
            </div>
            <p style={{ marginTop: "3mm", fontSize: "10pt" }}>
              下記の通りご請求申し上げます。
            </p>
            <p style={{ marginTop: "8mm", fontSize: "11pt" }}>
              <strong>請求対象期間：</strong>
              {inv.periodYear}年{inv.periodMonth}月分
            </p>
            <p style={{ fontSize: "13pt", marginTop: "3mm" }}>
              <strong>ご請求金額：</strong>
              <span style={{ fontSize: "16pt" }}>{yen(inv.total)}</span>（税込）
            </p>
            {inv.dueDate && (
              <p style={{ fontSize: "10pt", marginTop: "2mm" }}>
                お支払期限：{dateJP(inv.dueDate)}
              </p>
            )}
          </div>
          <div style={{ width: "40%", fontSize: "10pt" }}>
            <table style={{ width: "100%" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "1mm 0" }}>請求番号</td>
                  <td style={{ fontFamily: "monospace" }}>{inv.invoiceNumber}</td>
                </tr>
                <tr>
                  <td>発行日</td>
                  <td>{dateJP(inv.issueDate)}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ marginTop: "4mm", paddingTop: "2mm", borderTop: "1px solid #000" }}>
              <strong>{issuer?.name || session.user.tenantName}</strong>
              {issuer?.postalCode && <div>〒{issuer.postalCode}</div>}
              {issuer?.address && <div>{issuer.address}</div>}
              {issuer?.phone && <div>TEL: {issuer.phone}</div>}
              {issuer?.bankInfo && (
                <div style={{ marginTop: "2mm", fontSize: "9pt" }}>
                  <strong>振込先：</strong>
                  <br />
                  {issuer.bankInfo}
                </div>
              )}
            </div>
          </div>
        </div>

        <h2 style={{ fontSize: "12pt", margin: "4mm 0 2mm" }}>■ 伝票一覧</h2>
        <table className="ptbl" style={{ marginBottom: "6mm" }}>
          <thead>
            <tr>
              <th>注文番号</th>
              <th>納品日</th>
              <th className="tr">小計</th>
              <th className="tr">消費税</th>
              <th className="tr">合計</th>
            </tr>
          </thead>
          <tbody>
            {inv.orders.map((io) => (
              <tr key={io.orderId}>
                <td style={{ fontFamily: "monospace" }}>{io.order.orderNumber}</td>
                <td>{dateJP(io.order.dueDate || io.order.orderDate)}</td>
                <td className="tr">{yen(io.order.subtotal)}</td>
                <td className="tr">{yen(io.order.tax)}</td>
                <td className="tr">{yen(io.order.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={2} className="tr">合計</th>
              <th className="tr">{yen(inv.subtotal)}</th>
              <th className="tr">{yen(inv.tax)}</th>
              <th className="tr">{yen(inv.total)}</th>
            </tr>
          </tfoot>
        </table>

        <h2 style={{ fontSize: "12pt", margin: "4mm 0 2mm" }}>■ 商品別明細</h2>
        <table className="ptbl">
          <thead>
            <tr>
              <th>品名</th>
              <th className="tr" style={{ width: "16%" }}>数量</th>
              <th className="tr" style={{ width: "20%" }}>金額</th>
            </tr>
          </thead>
          <tbody>
            {details.map((d, i) => (
              <tr key={i}>
                <td>{d.itemName}</td>
                <td className="tr">{num(d.quantity)} {d.unit}</td>
                <td className="tr">{yen(d.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
