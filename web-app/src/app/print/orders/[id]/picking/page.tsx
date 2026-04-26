import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PrintToolbar } from "@/components/PrintToolbar";
import { num, dateJP } from "@/lib/format";

export const dynamic = "force-dynamic";

// ピッキングリスト（旧: printDocument1） — 数量と商品コードのみ、価格は出さない
export default async function PickingListPrintPage({ params }: { params: { id: string } }) {
  const { tenantId } = await requireTenant();
  const order = await prisma.order.findFirst({
    where: { id: params.id, tenantId },
    include: {
      customer: true,
      items: { include: { item: true } },
    },
  });
  if (!order) notFound();

  return (
    <>
      <PrintToolbar title={`ピッキングリスト ${order.orderNumber}`} />
      <div className="print-sheet">
        <h1 className="print-title">ピッキングリスト</h1>

        <table style={{ width: "100%", marginBottom: "6mm", fontSize: "11pt" }}>
          <tbody>
            <tr>
              <td style={{ padding: "1mm 0", width: "20%" }}><strong>注文番号</strong></td>
              <td style={{ fontFamily: "monospace" }}>{order.orderNumber}</td>
              <td style={{ width: "20%" }}><strong>納品日</strong></td>
              <td>{dateJP(order.dueDate)}</td>
            </tr>
            <tr>
              <td><strong>得意先</strong></td>
              <td colSpan={3} style={{ fontSize: "13pt" }}>{order.customer.name}</td>
            </tr>
          </tbody>
        </table>

        <table className="ptbl">
          <thead>
            <tr>
              <th style={{ width: "8%" }}>No</th>
              <th style={{ width: "18%" }}>商品コード</th>
              <th>商品名</th>
              <th className="tr" style={{ width: "16%" }}>数量</th>
              <th className="tc" style={{ width: "10%" }}>確認</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((l, i) => (
              <tr key={l.id}>
                <td className="tc">{i + 1}</td>
                <td style={{ fontFamily: "monospace" }}>{l.item.code}</td>
                <td>{l.itemName}</td>
                <td className="tr">{num(l.quantity)} {l.unit}</td>
                <td className="tc">□</td>
              </tr>
            ))}
            {Array.from({ length: Math.max(0, 16 - order.items.length) }).map((_, i) => (
              <tr key={`e-${i}`}>
                <td>&nbsp;</td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>

        <p style={{ marginTop: "6mm", fontSize: "9pt", color: "#444" }}>
          ピッキング担当者：__________________ &nbsp;&nbsp; 確認者：__________________
        </p>
      </div>
    </>
  );
}
