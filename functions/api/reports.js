export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    const url = new URL(context.request.url);
    const nodeId = url.searchParams.get('nodeId');
    const hasNode = nodeId && nodeId !== 'ALL';

    // 1. Stock total por País (Nodo)
    let q1 = `SELECT n.name as label, SUM(i.quantity) as value FROM inventory i JOIN nodes n ON i.node_id = n.id GROUP BY n.id ORDER BY value DESC`;
    if (hasNode) {
        q1 = `SELECT n.name as label, SUM(i.quantity) as value FROM inventory i JOIN nodes n ON i.node_id = n.id WHERE i.node_id = ? GROUP BY n.id ORDER BY value DESC`;
    }
    const { results: byNode } = hasNode ? await db.prepare(q1).bind(nodeId).all() : await db.prepare(q1).all();

    // 2. Stock total por Categoría
    let q2 = `SELECT COALESCE(NULLIF(p.category, ''), 'Sin Categoría') as label, SUM(i.quantity) as value FROM inventory i JOIN products p ON i.product_id = p.id GROUP BY label ORDER BY value DESC`;
    if (hasNode) {
        q2 = `SELECT COALESCE(NULLIF(p.category, ''), 'Sin Categoría') as label, SUM(i.quantity) as value FROM inventory i JOIN products p ON i.product_id = p.id WHERE i.node_id = ? GROUP BY label ORDER BY value DESC`;
    }
    const { results: byCategory } = hasNode ? await db.prepare(q2).bind(nodeId).all() : await db.prepare(q2).all();

    // 3. Alertas Automáticas (Filtradas por país)
    let q3 = `
        SELECT p.sku, p.name, n.name as node, i.quantity, CASE WHEN i.quantity <= 50 THEN 'critical' WHEN i.quantity >= 2000 THEN 'warning' END as alert_type
        FROM inventory i JOIN products p ON i.product_id = p.id JOIN nodes n ON i.node_id = n.id
        WHERE (i.quantity <= 50 OR i.quantity >= 2000)
        ORDER BY i.quantity ASC
    `;
    if (hasNode) {
        q3 = `
            SELECT p.sku, p.name, n.name as node, i.quantity, CASE WHEN i.quantity <= 50 THEN 'critical' WHEN i.quantity >= 2000 THEN 'warning' END as alert_type
            FROM inventory i JOIN products p ON i.product_id = p.id JOIN nodes n ON i.node_id = n.id
            WHERE (i.quantity <= 50 OR i.quantity >= 2000) AND i.node_id = ?
            ORDER BY i.quantity ASC
        `;
    }
    const { results: alerts } = hasNode ? await db.prepare(q3).bind(nodeId).all() : await db.prepare(q3).all();

    return new Response(JSON.stringify({ 
        status: "success", 
        data: { byNode, byCategory, alerts } 
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
