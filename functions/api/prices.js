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

    const { results } = await db.prepare(query).bind(nodeId, nodeId).all();

    return new Response(JSON.stringify({ status: "success", data: results }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

// 2. ACTUALIZAR PRECIOS (POST) - CON SINCRONIZACIÓN EN ESPEJO
export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const payload = await context.request.json();
    const nodeId = parseInt(payload.nodeId, 10);
    const userId = payload.userId;

    if (!nodeId || isNaN(nodeId)) {
      return new Response(JSON.stringify({ error: "Falta seleccionar el país/depósito de destino." }), { status: 400 });
    }

    // --- NUEVA LÓGICA DE ESPEJO: CHINA <-> FÁBRICA ---
    let targetNodes = [nodeId]; // Por defecto, guardamos solo en el que elegiste
    
    // Averiguamos cómo se llama el depósito actual
    const currentNode = await db.prepare("SELECT name FROM nodes WHERE id = ?").bind(nodeId).first();
    
    if (currentNode) {
      const nodeName = currentNode.name.toUpperCase();
      // Si el nombre dice CHINA o FABRICA...
      if (nodeName.includes('CHINA') || nodeName.includes('FABRICA') || nodeName.includes('FÁBRICA')) {
        // Buscamos los IDs de AMBOS depósitos en la base de datos
        const linkedNodes = await db.prepare("SELECT id FROM nodes WHERE upper(name) LIKE '%CHINA%' OR upper(name) LIKE '%FABRICA%' OR upper(name) LIKE '%FÁBRICA%'").all();
        if (linkedNodes && linkedNodes.results.length > 0) {
            // Reemplazamos nuestro destino único por los IDs de ambos depósitos hermanos
            targetNodes = linkedNodes.results.map(n => n.id);
        }
      }
    }
    // -------------------------------------------------

    const statements = [];

    for (const item of payload.prices) {
      let productId = parseInt(item.productId, 10);

      if (isNaN(productId) && item.sku) {
        const skuClean = String(item.sku).trim();
        const prod = await db.prepare('SELECT id FROM products WHERE sku = ?').bind(skuClean).first();
        
        if (!prod) {
          const productName = item.name ? String(item.name).trim() : skuClean;
          const insertInfo = await db.prepare('INSERT INTO products (sku, name) VALUES (?, ?)').bind(skuClean, productName).run();
          productId = parseInt(insertInfo.meta.last_row_id, 10);
        } else {
          productId = parseInt(prod.id, 10);
        }
      }

      if (productId && !isNaN(productId)) {
        const finalPrice = parseFloat(item.price) || 0;
        
        // Magia: El bucle "targetNodes" hace que si son hermanos, guarde el precio en los dos. Si no, solo en uno.
        for (const targetId of targetNodes) {
            statements.push(
              db.prepare(`
                INSERT INTO prices (node_id, product_id, price) 
                VALUES (?, ?, ?)
                ON CONFLICT(node_id, product_id) DO UPDATE SET price = excluded.price
              `).bind(targetId, productId, finalPrice)
            );
        }
      }
    }

    if (userId && statements.length > 0) {
       const desc = targetNodes.length > 1 
          ? `Actualizó lista de precios en ESPEJO para nodos ${targetNodes.join(' y ')} (${payload.prices.length} productos)`
          : `Actualizó lista de precios para el nodo ${nodeId} (${payload.prices.length} productos)`;
       
       statements.push(
           db.prepare(`INSERT INTO audit_logs (user_id, action_type, description) VALUES (?, 'PRECIOS', ?)`)
             .bind(userId, desc)
       );
    }

    if (statements.length > 0) {
      await db.batch(statements);
    }

    // Devolvemos un mensaje inteligente a la pantalla
    return new Response(JSON.stringify({ 
      status: "success", 
      message: targetNodes.length > 1 
        ? `¡Éxito! Se guardaron ${payload.prices.length} precios y se sincronizaron en China y Fábrica a la vez.`
        : `Se guardaron ${payload.prices.length} precios correctamente.` 
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Error de BD: " + error.message }), { status: 500 });
  }
}
