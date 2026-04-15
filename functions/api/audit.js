export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    const url = new URL(context.request.url);
    const action = url.searchParams.get('action');

    // 1. REPORTE GLOBAL DE CUENTAS CORRIENTES
    if (action === 'saldos') {
      const query = `
        SELECT 
          c.id, 
          c.business_name, 
          n.name as node_name,
          COALESCE(SUM(t.amount), 0) as balance,
          MAX(t.created_at) as last_movement
        FROM clients c
        JOIN nodes n ON c.node_id = n.id
        LEFT JOIN client_transactions t ON c.id = t.client_id
        GROUP BY c.id
        ORDER BY balance DESC
      `;
      const { results } = await db.prepare(query).all();
      return new Response(JSON.stringify({ status: "success", data: results }), { headers: { "Content-Type": "application/json" } });
    }

    // 2. VALORIZACIÓN DE INVENTARIO POR DEPÓSITO
    if (action === 'valorizacion') {
      // Cruzamos inventario con la lista de precios de cada nodo para saber su valor potencial
      const query = `
        SELECT 
          n.id as node_id,
          n.name as node_name,
          SUM(i.quantity) as total_items,
          SUM(i.quantity * COALESCE(pr.price, 0)) as total_value
        FROM nodes n
        LEFT JOIN inventory i ON n.id = i.node_id
        LEFT JOIN prices pr ON i.product_id = pr.product_id AND i.node_id = pr.node_id
        GROUP BY n.id
        ORDER BY total_value DESC
      `;
      const { results } = await db.prepare(query).all();
      return new Response(JSON.stringify({ status: "success", data: results }), { headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Acción no válida." }), { status: 400 });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Error de BD: " + error.message }), { status: 500 });
  }
}
