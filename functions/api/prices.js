// 1. CONSULTAR PRECIOS Y STOCK (GET)
export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    const url = new URL(context.request.url);
    const rawNodeId = url.searchParams.get('nodeId') || url.searchParams.get('node');
    const nodeId = parseInt(rawNodeId, 10);

    if (!nodeId || isNaN(nodeId)) {
      return new Response(JSON.stringify({ error: "Debe especificar un país válido." }), { status: 400 });
    }

    // El filtro WHERE bloquea los eliminados antes de que viajen a la pantalla
    const query = `
      SELECT 
        p.id as product_id,
        p.sku,
        p.name,
        COALESCE(pr.price, 0) as price,
        COALESCE(i.quantity, 0) as stock
      FROM products p
      LEFT JOIN prices pr ON p.id = pr.product_id AND pr.node_id = ?
      LEFT JOIN inventory i ON p.id = i.product_id AND i.node_id = ?
      WHERE p.name NOT LIKE 'Z_ELIMINADO%'
      ORDER BY p.sku ASC
    `;

    // Pasamos nodeId dos veces (uno para precios, otro para inventario)
    const { results } = await db.prepare(query).bind(nodeId, nodeId).all();

    return new Response(JSON.stringify({ status: "success", data: results }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

// 2. ACTUALIZAR PRECIOS (POST)
export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const payload = await context.request.json();
    const nodeId = parseInt(payload.nodeId, 10);
    const userId = payload.userId;

    if (!nodeId || isNaN(nodeId)) {
      return new Response(JSON.stringify({ error: "Falta seleccionar el país/depósito de destino." }), { status: 400 });
    }

    const statements = [];

    for (const item of payload.prices) {
      let productId = parseInt(item.productId, 10);

      // Si nos pasan el SKU en lugar del ID numérico, lo buscamos
      if (isNaN(productId) && item.sku) {
        const skuClean = String(item.sku).trim();
        const prod = await db.prepare('SELECT id FROM products WHERE sku = ?').bind(skuClean).first();
        
        if (!prod) {
          // ¡MAGIA! El producto no existe, lo creamos al vuelo.
          // Si el Excel trae una columna "name", la usamos. Si no, le ponemos el SKU como nombre temporal.
          const productName = item.name ? String(item.name).trim() : skuClean;
          const insertInfo = await db.prepare('INSERT INTO products (sku, name) VALUES (?, ?)').bind(skuClean, productName).run();
          
          // Capturamos el ID del producto recién nacido para poder guardarle su precio
          productId = parseInt(insertInfo.meta.last_row_id, 10);
        } else {
          productId = parseInt(prod.id, 10);
        }
      }

      if (productId && !isNaN(productId)) {
        const finalPrice = parseFloat(item.price) || 0;
        statements.push(
          db.prepare(`
            INSERT INTO prices (node_id, product_id, price) 
            VALUES (?, ?, ?)
            ON CONFLICT(node_id, product_id) DO UPDATE SET price = excluded.price
          `).bind(nodeId, productId, finalPrice)
        );
      }
    }

    // Registro de Auditoría
    if (userId && statements.length > 0) {
       const desc = `Actualizó lista de precios para el nodo ${nodeId} (${payload.prices.length} productos)`;
       statements.push(
           db.prepare(`INSERT INTO audit_logs (user_id, action_type, description) VALUES (?, 'PRECIOS', ?)`)
             .bind(userId, desc)
       );
    }

    if (statements.length > 0) {
      await db.batch(statements);
    }

    return new Response(JSON.stringify({ 
      status: "success", 
      message: `Se guardaron ${payload.prices.length} precios correctamente.` 
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Error de BD: " + error.message }), { status: 500 });
  }
}
