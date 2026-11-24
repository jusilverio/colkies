import { confirmarPedido } from "../lib/pagamento.mjs";

export default async (req) => {
  try {
    const w = await req.json();
    const r = await confirmarPedido({
      order_nsu: w.order_nsu, transaction_nsu: w.transaction_nsu, slug: w.invoice_slug,
    });
    // fora de 2xx = a InfinitePay tenta de novo
    return new Response(r.ok ? "ok" : "nao confirmado", { status: r.ok ? 200 : 400 });
  } catch (e) {
    console.error(e);
    return new Response("erro", { status: 400 });
  }
};
