export async function onRequestGet(context) {
  try {
    const db = context.env.DB;

    // 1. Stock total por País (Nodo)
    const { results: byNode } = await db.prepare(`
        SELECT n.name as label, SUM(i.quantity) as value 
        FROM inventory i 
        JOIN nodes n ON i.node_id = n.id 
        GROUP BY n.id
        ORDER BY value DESC
    `).all();

    // 2. Stock total por Categoría
    const { results: byCategory } = await db.prepare(`
        SELECT COALESCE(NULLIF(p.category, ''), 'Sin Categoría') as label, SUM(i.quantity) as value 
        FROM inventory i 
        JOIN products p ON i.product_id = p.id 
        GROUP BY label
        ORDER BY value DESC
    `).all();

    // 3. Motor de Alertas Automáticas (Ascensos/Descensos extremos)
    // Definimos reglas de negocio simples: < 50 es Riesgo de Quiebre, > 2000 es Capital Inmovilizado (Sobre-stock)
    const { results: alerts } = await db.prepare(`
        SELECT 
            p.sku, p.name, n.name as node, i.quantity,
            CASE 
                WHEN i.quantity <= 50 THEN 'critical'
                WHEN i.quantity >= 2000 THEN 'warning'
            END as alert_type
        FROM inventory i
        JOIN products p ON i.product_id = p.id
        JOIN nodes n ON i.node_id = n.id
        WHERE i.quantity <= 50 OR i.quantity >= 2000
        ORDER BY i.quantity ASC
    `).all();

    return new Response(JSON.stringify({ 
        status: "success", 
        data: { byNode, byCategory, alerts } 
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
