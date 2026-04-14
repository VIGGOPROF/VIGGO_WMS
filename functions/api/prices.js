export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const url = new URL(request.url);

  // --- MÉTODO GET: Leer precios de un nodo ---
  if (request.method === "GET") {
    const nodeId = url.searchParams.get('node');
    if (!nodeId) return new Response("Nodo requerido", { status: 400 });

    const query = `
      SELECT p.id as product_id, p.sku, p.name, COALESCE(pli.price, 0) as price
      FROM products p
      LEFT JOIN price_lists pl ON pl.node_id = ?
      LEFT JOIN price_list_items pli ON pli.price_list_id = pl.id AND pli.product_id = p.id
      ORDER BY p.sku
    `;
    const { results } = await db.prepare(query).bind(parseInt(nodeId)).all();
    return new Response(JSON.stringify({ data: results }), { headers: { "Content-Type": "application/json" } });
  }

  // --- MÉTODO POST: Guardar precios actualizados ---
  if (request.method === "POST") {
    try {
      const { nodeId, prices } = await request.json(); // prices: [{productId, price}, ...]
      
      // 1. Obtener el ID de la lista vinculada a ese nodo
      const list = await db.prepare("SELECT id FROM price_lists WHERE node_id = ?").bind(parseInt(nodeId)).first();
      if (!list) return new Response(JSON.stringify({ error: "No existe lista para este nodo" }), { status: 404 });

      const statements = [];
      for (const item of prices) {
        statements.push(
          db.prepare(`
            INSERT INTO price_list_items (price_list_id, product_id, price)
            VALUES (?, ?, ?)
            ON CONFLICT(price_list_id, product_id) DO UPDATE SET price = excluded.price
          `).bind(list.id, item.productId, parseFloat(item.price))
        );
      }

      await db.batch(statements);
      return new Response(JSON.stringify({ success: true, message: "Precios actualizados" }));

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }
}
