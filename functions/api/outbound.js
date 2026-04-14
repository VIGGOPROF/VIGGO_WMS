export async function onRequestPost(context) {
  try {
    const data = await context.request.json();
    const db = context.env.DB;

    const nodeId = parseInt(data.nodeId);
    const sku = data.sku.trim();
    const qty = parseInt(data.qty);

    // 1. Buscar el ID del producto y verificar cuánto stock físico tiene este nodo
    const stockQuery = await db.prepare(`
      SELECT p.id as product_id, i.quantity
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id AND i.node_id = ?
      WHERE p.sku = ?
    `).bind(nodeId, sku).first();

    // Validaciones de seguridad
    if (!stockQuery || !stockQuery.product_id) {
        return new Response(JSON.stringify({ error: "El SKU no existe en la base de datos." }), { status: 404 });
    }
    if (stockQuery.quantity === null || stockQuery.quantity < qty) {
        return new Response(JSON.stringify({ error: `Stock físico insuficiente. Disponible: ${stockQuery.quantity || 0}` }), { status: 400 });
    }

    // 2. Descontar el stock de la base de datos
    await db.prepare(`
      UPDATE inventory 
      SET quantity = quantity - ?, last_updated = CURRENT_TIMESTAMP
      WHERE node_id = ? AND product_id = ?
    `).bind(qty, nodeId, stockQuery.product_id).run();

    return new Response(JSON.stringify({ 
        status: "success", 
        message: `Salida exitosa. Se descontaron ${qty} unidades del stock físico.` 
    }), { 
        headers: { "Content-Type": "application/json" } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
