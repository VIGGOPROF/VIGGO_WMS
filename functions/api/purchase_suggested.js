export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    const url = new URL(context.request.url);
    const nodeId = url.searchParams.get('nodeId');

    const query = `
      SELECT 
          p.sku, 
          p.name,
          SUM(i.quantity) as physical_stock,
          COALESCE((SELECT SUM(ti.quantity) FROM transfer_items ti JOIN transfers t ON ti.transfer_id = t.id WHERE ti.product_id = p.id AND t.destination_node_id = ${nodeId} AND t.status = 'in_transit'), 0) as transit_stock,
          /* Venta Promedio Mensual (VPM). Aquí simulamos 150, luego lo conectaremos a tu tabla de facturación */
          150 as avg_monthly_sales 
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id AND i.node_id = ${nodeId}
      GROUP BY p.id
    `;

    const { results } = await db.prepare(query).all();
    return new Response(JSON.stringify({ status: "success", data: results }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
