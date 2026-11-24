import { confirmarPedido } from "../lib/pagamento.mjs";

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const r = await confirmarPedido({
    order_nsu: q.get("order_nsu"), transaction_nsu: q.get("transaction_nsu"), slug: q.get("slug"),
  }).catch(() => ({ ok: false }));
  return new Response(
    JSON.stringify({ pago: !!r.ok, entrega: r.ok ? r.pedido.agendamento : null }),
    { headers: { "Content-Type": "application/json" } }
  );
};
