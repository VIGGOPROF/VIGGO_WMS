export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    
    // Consulta que cruza Transferencias, Ítems, Productos y Nodos (Países)
    const query = `
      SELECT 
        t.id as transfer_id, 
        no.name as origin, 
        nd.name as destination, 
        p.sku, 
        p.name as product, 
        ti.quantity, 
        t.dispatch_date, 
        t.estimated_arrival
      FROM transfers t
      JOIN nodes no ON t.origin_node_id = no.id
      JOIN nodes nd ON t.destination_node_id = nd.id
      JOIN transfer_items ti ON t.id = ti.transfer_id
      JOIN products p ON ti.product_id = p.id
      WHERE t.status = 'in_transit'
      ORDER BY t.estimated_arrival ASC
    `;
    
    const { results } = await db.prepare(query).all();
    
    return new Response(JSON.stringify({ status: "success", data: results }), { 
        headers: { "Content-Type": "application/json" } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
