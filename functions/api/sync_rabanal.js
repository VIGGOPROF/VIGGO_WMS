export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const db = env.DB;
    
    // Ahora leemos el nodeId que nos mandó el Frontend
    const realNodeId = parseInt(body.nodeId, 10);

    if (!realNodeId || isNaN(realNodeId)) {
        return new Response(JSON.stringify({ error: "Falta el ID del depósito de destino." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return new Response(JSON.stringify({ error: "El Excel está vacío o no es válido." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 1. BATCH 1: Crear productos nuevos en "Paquetes" (Ignora los que ya existen)
    const productStmts = [];
    for (const item of body.items) {
      const sku = String(item.sku).trim();
      const name = String(item.name || sku).trim();
      productStmts.push(db.prepare("INSERT OR IGNORE INTO products (sku, name) VALUES (?, ?)").bind(sku, name));
    }
    
    // Enviamos las creaciones a la base de datos en paquetes de 50
    for (let i = 0; i < productStmts.length; i += 50) {
        await db.batch(productStmts.slice(i, i + 50));
    }

    // 2. Traemos el catálogo a la memoria rápido para sacar los IDs
    const { results: allProducts } = await db.prepare("SELECT id, sku FROM products").all();
    const productMap = {};
    for (const p of allProducts) {
        productMap[String(p.sku).trim().toLowerCase()] = p.id;
    }

    // 3. BATCH 2: MAGIA UPSERT (Pisar o Insertar Inventario)
    const invStmts = [];
    for (const item of body.items) {
        const sku = String(item.sku).trim().toLowerCase();
        const stock = Number(item.stock) || 0;
        const pid = productMap[sku];
        
        if (pid) {
            // Se inserta en "realNodeId" (El país que el usuario eligió en el desplegable)
            invStmts.push(
                db.prepare(`
                    INSERT INTO inventory (node_id, product_id, quantity, transit_stock) 
                    VALUES (?, ?, ?, 0) 
                    ON CONFLICT(node_id, product_id) 
                    DO UPDATE SET quantity = excluded.quantity
                `).bind(realNodeId, pid, stock)
            );
        }
    }

    // Enviamos la actualización masiva en paquetes de 50
    for (let i = 0; i < invStmts.length; i += 50) {
        await db.batch(invStmts.slice(i, i + 50));
    }

    return new Response(JSON.stringify({ 
        success: true, 
        new_items: 0, 
        updated_items: invStmts.length 
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    const errorMsg = error.message || String(error) || "Error desconocido";
    return new Response(JSON.stringify({ error: "Fallo masivo BD: " + errorMsg }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}
