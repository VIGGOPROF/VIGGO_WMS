export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const db = env.DB;

    if (!body.items || !Array.isArray(body.items)) {
      return new Response(JSON.stringify({ error: "El Excel no contiene artículos válidos." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 1. MAGIA: Buscamos el ID real del depósito de Argentina dinámicamente
    const nodeArg = await db.prepare("SELECT id FROM nodes WHERE name LIKE '%ARG%' LIMIT 1").first();
    
    if (!nodeArg) {
        return new Response(JSON.stringify({ error: "No se encontró el depósito 'ARG' en el sistema. Asegúrate de que exista en la lista." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    
    const realNodeId = nodeArg.id;
    let newCount = 0;
    let updateCount = 0;

    for (const item of body.items) {
      // Limpiamos los datos por si el Excel trae espacios en blanco
      const sku = String(item.sku).trim();
      const name = String(item.name || sku).trim();
      const stock = Number(item.stock) || 0;

      // 2. Buscar producto en Catálogo Maestro
      let product = await db.prepare("SELECT id FROM products WHERE sku = ?").bind(sku).first();
      let productId;

      if (!product) {
        // Crear el producto si es nuevo
        const insertInfo = await db.prepare("INSERT INTO products (sku, name) VALUES (?, ?)").bind(sku, name).run();
        productId = insertInfo.meta.last_row_id;
        newCount++;
      } else {
        productId = product.id;
      }

      // 3. Buscar si ya tiene inventario en ARG (usando el ID dinámico)
      const inv = await db.prepare("SELECT id FROM inventory WHERE product_id = ? AND node_id = ?").bind(productId, realNodeId).first();

      if (inv) {
        // Si existe, actualizamos solo el stock físico
        await db.prepare("UPDATE inventory SET physical_stock = ? WHERE id = ?").bind(stock, inv.id).run();
        updateCount++;
      } else {
        // Si no existe, creamos la fila de inventario desde cero
        await db.prepare("INSERT INTO inventory (product_id, node_id, physical_stock, transit_stock) VALUES (?, ?, ?, 0)").bind(productId, realNodeId, stock).run();
        updateCount++;
      }
    }

    // Devolver resultados exitosos
    return new Response(JSON.stringify({ success: true, new_items: newCount, updated_items: updateCount }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    // Atrapamos el error de forma segura para que la pantalla NUNCA MÁS diga "undefined"
    const errorMsg = error.message || String(error) || "Error SQL desconocido.";
    return new Response(JSON.stringify({ error: "Fallo interno BD: " + errorMsg }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
