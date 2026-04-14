export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    const url = new URL(context.request.url);
    const nodeId = url.searchParams.get('nodeId'); // Capturamos el filtro

    // Filtro SQL dinámico
    const nodeFilter = nodeId ? `WHERE i.node_id = ${nodeId}` : '';
    const alertFilter = nodeId ? `AND n.id = ${nodeId}` : '';

    // 1. Stock por Nodo (Si hay filtro, solo devuelve ese nodo)
    const { results: byNode } = await db.prepare(`
        SELECT n.name as label, SUM(i.quantity) as value 
        FROM inventory i 
        JOIN nodes n ON i.node_id = n.id 
        ${nodeFilter}
        GROUP BY n.id
    `).all();

    // 2. Stock por Categoría (Afectado por el filtro de país)
    const { results: byCategory } = await db.prepare(`
        SELECT COALESCE(NULLIF(p.category, ''), 'Sin Categoría') as label, SUM(i.quantity) as value 
        FROM inventory i 
        JOIN products p ON i.product_id = p.id 
        ${nodeFilter}
        GROUP BY label
    `).all();

    // 3. Alertas (Afectadas por el filtro de país)
    const { results: alerts } = await db.prepare(`
        SELECT p.sku, p.name, n.name as node, i.quantity,
               CASE WHEN i.quantity <= 50 THEN 'critical' ELSE 'warning' END as alert_type
        FROM inventory i
        JOIN products p ON i.product_id = p.id
        JOIN nodes n ON i.node_id = n.id
        WHERE (i.quantity <= 50 OR i.quantity >= 2000) ${alertFilter}
        ORDER BY i.quantity ASC
    `).all();

    return new Response(JSON.stringify({ status: "success", data: { byNode, byCategory, alerts } }), 
        { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
