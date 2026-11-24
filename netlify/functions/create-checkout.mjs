import { randomUUID } from "node:crypto";
import { HANDLE, pedidos } from "../lib/pagamento.mjs";

const ORIGEM = "Rua Curupace, 61, Mooca, São Paulo - SP";

// Preços em CENTAVOS, na MESMA ORDEM do array AVULSOS do index.html.
const CATALOGO = [
  { n: "The OG", p: 1400 },
  { n: "Dark Side", p: 1600 },
  { n: "Nutella Crush", p: 1900 },
  { n: "Caramel Affair", p: 1900 },
  { n: "Kinder Crush", p: 2200 },
  { n: "S'more Christmas Please", p: 2300 },
  { n: "Orange You Sweet?", p: 2300 },
  { n: "Ginger Bells", p: 2300 },
];
const EMBALAGENS = {
  caixa: { n: "Embalagem de presente (caixa com fita)", p: 800 },
  lata: { n: "Embalagem de presente (lata dourada com fita)", p: 1500 },
};

const resp = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Seg/ter/qui/sex 18h–22h · qua/sáb/dom 9h–20h (igual ao site)
function horarioValido({ date, time } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !/^\d{2}:00$/.test(time || "")) return false;
  const dow = new Date(date + "T12:00:00Z").getUTCDay();
  const [ini, fim] = [1, 2, 4, 5].includes(dow) ? [18, 22] : [9, 20];
  const h = Number(time.slice(0, 2));
  return h >= ini && h < fim && new Date(`${date}T${time}:00-03:00`) > new Date();
}

export default async (req) => {
  if (req.method !== "POST") return resp(405, { message: "Método não permitido." });
  try {
    const b = await req.json();
    const origin = new URL(req.url).origin;

    // 1) itens e preços vêm do servidor, nunca do navegador
    const items = [];
    for (const it of b.items || []) {
      const prod = CATALOGO[it.id], q = Number(it.quantity);
      if (!prod || !Number.isInteger(q) || q < 1 || q > 99) return resp(400, { message: "Item inválido no carrinho." });
      items.push({ description: prod.n, quantity: q, price: prod.p });
    }
    if (!items.length) return resp(400, { message: "Carrinho vazio." });

    // 2) cliente e entrega
    const c = b.cliente || {};
    let tel = String(c.phone || "").replace(/\D/g, "");
    if (tel.length > 11 && tel.startsWith("55")) tel = tel.slice(2);
    if (!c.name?.trim() || !/^\S+@\S+\.\S+$/.test(c.email || "") || tel.length < 10 || tel.length > 11)
      return resp(400, { message: "Confira nome, e-mail e WhatsApp com DDD." });
    if (!horarioValido(b.agendamento)) return resp(400, { message: "Escolha uma data e um horário de entrega disponível." });

    // 3) frete recalculado no servidor pela função /frete (com a origem fixa daqui)
    const presente = b.tipo === "presente";
    const fr = await fetch(new URL("/.netlify/functions/frete", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agendamento: b.agendamento, origem: ORIGEM, tipo: b.tipo,
        embalagem: presente ? b.embalagem : null, entrega: c,
        items: items.map((x, i) => ({ id: b.items[i].id, quantity: x.quantity })),
      }),
    });
    const frete = await fr.json().catch(() => ({}));
    if (!fr.ok || !frete.available) return resp(422, { message: frete.message || "Frete indisponível para este endereço." });

    const mm = b.agendamento.date.slice(5, 7), dd = b.agendamento.date.slice(8, 10);
    if (frete.shipping_cents > 0)
      items.push({ description: `Frete · entrega ${dd}/${mm} às ${b.agendamento.time}`, quantity: 1, price: frete.shipping_cents });
    if (presente) {
      const emb = EMBALAGENS[b.embalagem] || EMBALAGENS.caixa;
      items.push({ description: emb.n, quantity: 1, price: emb.p });
    }

    const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
    if (total < 100) return resp(400, { message: "Valor mínimo de R$ 1,00." });
    if (b.total_esperado_cents !== total)
      return resp(409, { message: "Os valores mudaram. Clique em Verificar frete novamente." });

    // 4) salva o pedido (data/hora, endereço, presente) antes de criar o link
    const order_nsu = randomUUID();
    const pedido = {
      order_nsu, status: "aguardando", criado_em: new Date().toISOString(), total_cents: total,
      tipo: b.tipo, cliente: c, agendamento: b.agendamento, items,
      presente: presente ? {
        para: String(b.presente?.para || "").slice(0, 80),
        de: String(b.presente?.de || "").slice(0, 80),
        mensagem: String(b.presente?.mensagem || "").slice(0, 280),
      } : null,
    };
    const store = pedidos();
    await store.setJSON(order_nsu, pedido);

    // 5) cria o link na InfinitePay
    const r = await fetch("https://api.checkout.infinitepay.io/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: HANDLE, order_nsu, items,
        redirect_url: `${origin}/obrigado.html`,
        webhook_url: `${origin}/.netlify/functions/webhook-infinitepay`,
        customer: { name: c.name.trim(), email: c.email.trim(), phone_number: "+55" + tel },
        address: {
          cep: c.cep, street: c.street, number: c.number, neighborhood: c.neighborhood,
          city: c.city, state: c.state, ...(c.complement ? { complement: c.complement } : {}),
        },
      }),
    });
    const data = await r.json().catch(() => ({}));
    const url = data.url ?? data.link ?? data.checkout_url;
    if (!r.ok || !url) {
      console.error("InfinitePay /links falhou", r.status, JSON.stringify(data));
      return resp(502, { message: "Não foi possível criar o pagamento agora. Tente novamente em instantes." });
    }

    pedido.link = url;
    await store.setJSON(order_nsu, pedido);
    return resp(200, { url });
  } catch (e) {
    console.error(e);
    return resp(500, { message: "Erro inesperado. Tente novamente." });
  }
};
