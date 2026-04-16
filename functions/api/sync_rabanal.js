export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const db = env.DB;

    if (!body.items || !Array.isArray(body.items)) {
      return new Response(JSON.stringify({ error: "El Excel no contiene artículos válidos." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Buscamos el ID real de ARG
    const nodeArg = await db.prepare("SELECT id FROM nodes WHERE name LIKE '%ARG%' LIMIT 1").first();
    
    if (!nodeArg) {
        return new Response(JSON.stringify({ error: "No se encontró el depósito ARG." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    
    const realNodeId = nodeArg.id;
    let newCount = 0;
    let updateCount = 0;

    for (const item of body.items) {
      const sku = String(item.sku).trim();
      const name = String(item.name || sku).trim();
      const stock = Number(item.stock) || 0;

      let product = await db.prepare("SELECT id FROM products WHERE sku = ?").bind(sku).first();
      let productId;

      if (!product) {
        const insertInfo = await db.prepare("INSERT INTO products (sku, name) VALUES (?, ?)").bind(sku, name).run();
        productId = insertInfo.meta.last_row_id;
        newCount++;
      } else {
        productId = product.id;
      }

      const inv = await db.prepare("SELECT id FROM inventory WHERE product_id = ? AND node_id = ?").bind(productId, realNodeId).first();

      if (inv) {
        // AQUÍ ES DONDE PISA EL VALOR (No lo suma)
        await db.prepare("UPDATE inventory SET physical_stock = ? WHERE id = ?").bind(stock, inv.id).run();
        updateCount++;
      } else {
        await db.prepare("INSERT INTO inventory (product_id, node_id, physical_stock, transit_stock) VALUES (?, ?, ?, 0)").bind(productId, realNodeId, stock).run();
        updateCount++;
      }
    }

    return new Response(JSON.stringify({ success: true, new_items: newCount, updated_items: updateCount }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    // EL TRUCO: Le mandamos status 400 para que Cloudflare no tape nuestro error con su HTML
    const errorMsg = error.message || String(error) || "Error desconocido";
    return new Response(JSON.stringify({ error: "ERROR INTERNO BD: " + errorMsg }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}
