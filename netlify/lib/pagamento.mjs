import { getStore } from "@netlify/blobs";

// A handle (InfiniteTag sem "$") não é segredo.
export const HANDLE = process.env.INFINITEPAY_HANDLE || "julia-silverio-616";
export const pedidos = () => getStore("pedidos");

// Confirma o pagamento direto na InfinitePay (o webhook não tem assinatura,
// então nunca confiamos só no que chega nele ou na URL de retorno).
export async function confirmarPedido({ order_nsu, transaction_nsu, slug }) {
  if (!order_nsu || !transaction_nsu || !slug) return { ok: false, motivo: "dados incompletos" };

  const store = pedidos();
  const pedido = await store.get(order_nsu, { type: "json" });
  if (!pedido) return { ok: false, motivo: "pedido não encontrado" };
  if (pedido.status === "pago") return { ok: true, pedido };

  const r = await fetch("https://api.checkout.infinitepay.io/payment_check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle: HANDLE, order_nsu, transaction_nsu, slug }),
  });
  const check = await r.json().catch(() => ({}));

  // amount = valor original da cobrança (paid_amount pode ser maior com taxas repassadas)
  if (!(check.success && check.paid && check.amount === pedido.total_cents)) {
    return { ok: false, motivo: "pagamento não confirmado", pedido };
  }

  pedido.status = "pago";
  pedido.pago_em = new Date().toISOString();
  pedido.transaction_nsu = transaction_nsu;
  pedido.slug = slug;
  pedido.paid_amount = check.paid_amount;
  pedido.metodo = check.capture_method;
  await store.setJSON(order_nsu, pedido);
  await notificar(pedido);
  return { ok: true, pedido };
}

// Aviso por e-mail via Resend (opcional). Sem as variáveis, o pedido fica só salvo no Netlify Blobs.
async function notificar(p) {
  if (!process.env.RESEND_API_KEY || !process.env.NOTIFY_EMAIL) return;
  const c = p.cliente, a = p.agendamento;
  const itens = p.items.map((i) => `${i.quantity}x ${i.description}`).join("\n");
  let texto =
    `Novo pedido pago!\n\n${itens}\n\nTotal: R$ ${(p.total_cents / 100).toFixed(2).replace(".", ",")}` +
    `\nPagamento: ${p.metodo || "-"}\nEntrega: ${a.date} às ${a.time}` +
    `\n\nCliente: ${c.name} · ${c.phone} · ${c.email}` +
    `\nEndereço: ${c.street}, ${c.number}${c.complement ? " - " + c.complement : ""} · ${c.neighborhood} · ${c.city}/${c.state} · CEP ${c.cep}`;
  if (p.presente) texto += `\n\nPRESENTE para ${p.presente.para} (de ${p.presente.de})\nBilhete: ${p.presente.mensagem || "-"}`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Coolkies <onboarding@resend.dev>",
      to: [process.env.NOTIFY_EMAIL],
      subject: `Novo pedido Coolkies – ${c.name}`,
      text: texto,
    }),
  }).catch((e) => console.error("Falha ao enviar e-mail", e));
}
