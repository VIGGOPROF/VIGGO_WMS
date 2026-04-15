// ====================================================================
// API: RADAR EN TRÁNSITO (functions/api/active_transits.js)
// ====================================================================

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    
    // Consulta SQL que cruza transferencias, depósitos (origen y destino) y catálogo de productos
    const query = `
      SELECT 
          t.id as transfer_id, 
          no.name as origin, 
          nd.name as destination, 
          p.sku, 
          p.name as product, 
          ti.quantity, 
          t.estimated_arrival,
          t.container_number,
          t.availability_date
      FROM transfers t
      JOIN nodes no ON t.origin_node_id = no.id
      JOIN nodes nd ON t.destination_node_id = nd.id
      JOIN transfer_items ti ON t.id = ti.transfer_id
      JOIN products p ON ti.product_id = p.id
      WHERE t.status = 'in_transit'
      ORDER BY t.estimated_arrival ASC
    `;

    const { results } = await db.prepare(query).all();

    return new Response(JSON.stringify({ 
      status: "success", 
      data: results 
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: "Error de BD: " + error.message 
    }), { status: 500 });
  }
}
