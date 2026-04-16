export async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.DB;
  const url = new URL(request.url);
  const categoryParam = url.searchParams.get('category');

  try {
    let whereClause = "";
    let params = [];

    // Filtro de categoría opcional
    if (categoryParam && categoryParam !== 'TODAS') {
      whereClause = "WHERE p.category = ?";
      params.push(categoryParam);
    }

    // 1. Obtener Columnas: Todos los depósitos ordenados
    const { results: nodes } = await db.prepare("SELECT id, name FROM nodes ORDER BY display_order ASC").all();

    // 2. Obtener Filas: Todos los productos (filtrados si aplica)
    const { results: products } = await db.prepare(`SELECT id, sku, name, category FROM products p ${whereClause} ORDER BY sku ASC`).bind(...params).all();

    // 3. Obtener Datos: Todo el inventario cruzado
    const { results: inventory } = await db.prepare(`
      SELECT i.product_id, i.node_id, i.quantity, i.transit_stock
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      ${whereClause}
    `).bind(...params).all();

    // 4. Obtener Categorías para el desplegable
    const { results: categories } = await db.prepare("SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != '' ORDER BY category ASC").all();

    // 5. Ensamblar la matriz para el frontend
    const itemsMap = {};
    for (const p of products) {
      itemsMap[p.id] = { sku: p.sku, name: p.name, category: p.category, stock: {} };
    }

    for (const inv of inventory) {
      if (itemsMap[inv.product_id]) {
        itemsMap[inv.product_id].stock[inv.node_id] = {
          quantity: inv.quantity || 0,
          transit: inv.transit_stock || 0
        };
      }
    }

    return new Response(JSON.stringify({
      success: true,
      nodes: nodes,
      categories: categories.map(c => c.category),
      items: Object.values(itemsMap)
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
