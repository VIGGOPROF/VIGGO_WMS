export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const nodeId = url.searchParams.get('node');
    const db = context.env.DB;

    // Buscamos las últimas transferencias con sus detalles de precio
    const query = `
      SELECT 
        t.id as transfer_id, 
        t.dispatch_date, 
        t.estimated_arrival,
        n.name as destination_name,
        p.sku, 
        p.name as product_name, 
        ti.quantity, 
        ti.unit_price_at_transfer as price
      FROM transfers t
      JOIN nodes n ON t.destination_node_id = n.id
      JOIN transfer_items ti ON t.id = ti.transfer_id
      JOIN products p ON ti.product_id = p.id
      WHERE t.destination_node_id = ?
      ORDER BY t.dispatch_date DESC
      LIMIT 20
    `;

    const { results } = await db.prepare(query).bind(parseInt(nodeId)).all();
    
    // Agrupamos por ID de transferencia
    const grouped = results.reduce((acc, row) => {
        if (!acc[row.transfer_id]) {
            acc[row.transfer_id] = {
                id: row.transfer_id,
                date: row.dispatch_date,
                destination: row.destination_name,
                items: []
            };
        }
        acc[row.transfer_id].items.push(row);
        return acc;
    }, {});

    return new Response(JSON.stringify({ data: Object.values(grouped) }), { 
        headers: { "Content-Type": "application/json" } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
