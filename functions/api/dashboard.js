export async function onRequestGet(context) {
  try {
    const db = context.env.DB;

    // Consulta gigante que cruza Nodos, Inventario y Productos
    const query = `
      SELECT 
        n.id as node_id, 
        n.name as node_name, 
        n.country_code,
        p.sku, 
        p.name as product_name, 
        i.quantity as physical_stock, 
        i.reserved_quantity as transit_stock
      FROM nodes n
      LEFT JOIN inventory i ON n.id = i.node_id
      LEFT JOIN products p ON i.product_id = p.id
      ORDER BY n.id, p.sku
    `;

    const { results } = await db.prepare(query).all();

    // Transformamos los datos crudos de SQL en un objeto anidado organizado por País
    const dashboardData = results.reduce((acc, row) => {
        // Si no hay producto, inicializamos el país vacío y seguimos
        if (!acc[row.node_name]) {
            acc[row.node_name] = { 
                code: row.country_code, 
                items: [] 
            };
        }
        
        if (row.sku) {
            acc[row.node_name].items.push({
                sku: row.sku,
                name: row.product_name,
                physical: row.physical_stock || 0,
                transit: row.transit_stock || 0
            });
        }
        return acc;
    }, {});

    return new Response(JSON.stringify({ status: "success", data: dashboardData }), { 
        headers: { "Content-Type": "application/json" } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
