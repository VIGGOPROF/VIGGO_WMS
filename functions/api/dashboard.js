export async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.DB;
  const url = new URL(request.url);
  const categoriesParam = url.searchParams.get('categories');

  try {
    let whereClause = "";
    let params = [];

    // Si el frontend envía categorías seleccionadas, armamos el filtro SQL
    if (categoriesParam) {
      const catArray = categoriesParam.split(',').map(c => c.trim()).filter(c => c);
      if (catArray.length > 0) {
        const placeholders = catArray.map(() => '?').join(',');
        whereClause = `WHERE p.category IN (${placeholders})`;
        params = catArray; // Inyectamos los valores de forma segura
      }
    }

    // 1. Obtener Stock Agrupado por Categoría (Afectado por el filtro)
    const catQuery = `
      SELECT COALESCE(p.category, 'Sin Categoría') as category, SUM(i.quantity) as total_stock
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      ${whereClause}
      GROUP BY p.category
      ORDER BY total_stock DESC
    `;
    const { results: stockByCategory } = await db.prepare(catQuery).bind(...params).all();

    // 2. Obtener la lista maestra de Categorías (Sin filtro, para armar los checkboxes)
    const { results: allCategories } = await db.prepare(`
      SELECT DISTINCT category 
      FROM products 
      WHERE category IS NOT NULL AND category != '' 
      ORDER BY category ASC
    `).all();

    // 3. Obtener Stock Agrupado por Nodos/Depósitos (Afectado por el filtro)
    const nodeQuery = `
      SELECT n.name as node_name, SUM(i.quantity) as total_stock
      FROM inventory i
      JOIN nodes n ON i.node_id = n.id
      JOIN products p ON i.product_id = p.id
      ${whereClause}
      GROUP BY n.id
      ORDER BY n.display_order ASC
    `;
    const { results: stockByNode } = await db.prepare(nodeQuery).bind(...params).all();

    // 4. Obtener el Stock Total global (Afectado por el filtro)
    const totalQuery = `
      SELECT SUM(i.quantity) as total
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      ${whereClause}
    `;
    const totalStockResult = await db.prepare(totalQuery).bind(...params).first();

    // Devolvemos todo el paquete al frontend
    return new Response(JSON.stringify({
      success: true,
      stockByCategory,
      allCategories: allCategories.map(c => c.category),
      stockByNode,
      totalStock: totalStockResult ? totalStockResult.total || 0 : 0
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
