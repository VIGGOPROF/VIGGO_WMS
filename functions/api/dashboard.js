export async function onRequestGet(context) {
  try {
    const db = context.env.DB;

    // 1. Nodos ordenados por la configuración del Catálogo
    const { results: nodes } = await db.prepare(`
        SELECT id, name FROM nodes 
        ORDER BY display_order ASC
    `).all();

    // 2. Inventario respetando el Orden de tu Catálogo
    const query = `
        SELECT 
            p.sku, 
            p.name as product_name,
            p.display_order,
            i.node_id, 
            i.quantity,
            COALESCE((
                SELECT SUM(ti.quantity) 
                FROM transfer_items ti
                JOIN transfers t ON ti.transfer_id = t.id
                WHERE ti.product_id = p.id 
                AND t.destination_node_id = i.node_id 
                AND t.status = 'in_transit'
            ), 0) as transit_qty
        FROM products p
        LEFT JOIN inventory i ON p.id = i.product_id
        ORDER BY p.display_order ASC, p.sku ASC
    `;
    
    const { results: inventory } = await db.prepare(query).all();

    return new Response(JSON.stringify({ status: "success", nodes, inventory }), {
        headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
