// ====================================================================
// API: GESTOR DE PRECIOS (functions/api/prices.js)
// ====================================================================

// 1. CONSULTAR PRECIOS (GET)
export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    const url = new URL(context.request.url);
    
    // Capturamos el ID y lo forzamos a ser un Número Entero
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
        COALESCE(pr.price, 0) as price
      FROM products p
      LEFT JOIN prices pr ON p.id = pr.product_id AND pr.node_id = ?
      ORDER BY p.sku ASC
    `;

    const { results } = await db.prepare(query).bind(nodeId).all();

    return new Response(JSON.stringify({ status: "success", data: results }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

// 2. ACTUALIZAR PRECIOS (POST)
export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const payload = await context.request.json();
    
    // Forzamos el ID del país a Número Entero
    const nodeId = parseInt(payload.nodeId, 10);

    if (!nodeId || isNaN(nodeId)) {
      return new Response(JSON.stringify({ error: "Falta seleccionar el país/depósito de destino." }), { status: 400 });
    }

    const statements = [];

    // Procesamos cada precio enviado
    for (const item of payload.prices) {
      
      // Forzamos el ID del producto a Número Entero
      let productId = parseInt(item.productId, 10);

      // Si no hay ID numérico (porque viene del Excel), lo buscamos por SKU
      if (isNaN(productId) && item.sku) {
        const prod = await db.prepare('SELECT id FROM products WHERE sku = ?').bind(item.sku.trim()).first();
        
        if (!prod) {
          return new Response(JSON.stringify({ 
            error: `El SKU "${item.sku}" no existe en el sistema. Créalo en el Catálogo primero.` 
          }), { status: 400 });
        }
        productId = parseInt(prod.id, 10);
      }

      // Preparamos el guardado asegurándonos de que el precio sea un número decimal (Float)
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

    // Ejecutamos todos los cambios en bloque (Batch)
    if (statements.length > 0) {
      await db.batch(statements);
    }

    return new Response(JSON.stringify({ 
      status: "success", 
      message: `Se guardaron ${statements.length} precios correctamente.` 
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Error de BD: " + error.message }), { status: 500 });
  }
}
