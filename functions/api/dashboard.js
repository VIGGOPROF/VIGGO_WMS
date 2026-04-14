export async function onRequestGet(context) {
  try {
    const db = context.env.DB;

    // 1. Aquí está tu código ordenando las columnas (Nodos)
    const { results: nodes } = await db.prepare(`
        SELECT id, name FROM nodes 
        ORDER BY 
          CASE id 
            WHEN 1 THEN 1 /* China Central */
            WHEN 5 THEN 2 /* Depósito Fábrica */
            WHEN 2 THEN 3 /* Argentina HQ */
            WHEN 3 THEN 4 /* Paraguay Dist. */
            WHEN 4 THEN 5 /* Chile Filial */
            ELSE 6 
          END
    `).all();

    // 2. Aquí obtenemos el inventario respetando el Orden de tu Catálogo
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
