export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const nodeId = url.searchParams.get('node');
    const db = context.env.DB;

    if (!nodeId) return new Response(JSON.stringify({ error: "Falta el ID del nodo" }), { status: 400 });

    // Buscamos solo los productos que tienen stock en tránsito (> 0) para este nodo
    const query = `
      SELECT p.id as product_id, p.sku, p.name, i.reserved_quantity as in_transit
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      WHERE i.node_id = ? AND i.reserved_quantity > 0
    `;

    const { results } = await db.prepare(query).bind(parseInt(nodeId)).all();

    return new Response(JSON.stringify({ status: "success", data: results }), { 
        headers: { "Content-Type": "application/json" } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
