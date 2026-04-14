export async function onRequestPost(context) {
  try {
    const data = await context.request.json();
    const db = context.env.DB;

    const nodeId = parseInt(data.nodeId);
    const items = data.items; 

    if (!nodeId || !items || items.length === 0) {
        return new Response(JSON.stringify({ error: "Datos incompletos para el ingreso." }), { status: 400 });
    }

    // --- NUEVO: Extraer todas las fábricas válidas de la BD ---
    const { results: validFactoriesQuery } = await db.prepare("SELECT name FROM factories").all();
    const validFactories = new Set(validFactoriesQuery.map(f => f.name.toLowerCase()));

    const statements = [];
    let totalQty = 0;

    for (const item of items) {
        const sku = (item.SKU || item.sku || '').toString().trim();
        const name = (item.Nombre || item.nombre || item.name || '').toString().trim();
        const category = (item.Categoria || item.Categoría || item.category || '').toString().trim();
        const factory = (item.Fabrica || item.Fábrica || item.factory || '').toString().trim();
        const qty = parseInt(item.Cantidad || item.cantidad || item.qty);

        if (!sku || !qty || qty <= 0) continue;

        // --- NUEVO: Validar Fábrica ---
        if (factory && !validFactories.has(factory.toLowerCase())) {
            return new Response(JSON.stringify({ 
                error: `La fábrica "${factory}" del SKU ${sku} no está registrada. Por favor, créala en el sistema primero.` 
            }), { status: 400 });
        }

        statements.push(
            db.prepare(`
                INSERT INTO products (sku, name, category, factory_name) 
                VALUES (?, ?, ?, ?)
                ON CONFLICT(sku) DO UPDATE SET 
                    name = excluded.name,
                    category = excluded.category,
                    factory_name = excluded.factory_name
            `).bind(sku, name || sku, category, factory)
        );

        statements.push(
            db.prepare(`
                INSERT INTO inventory (node_id, product_id, quantity)
                VALUES (?, (SELECT id FROM products WHERE sku = ?), ?)
                ON CONFLICT(node_id, product_id) DO UPDATE SET 
                    quantity = quantity + excluded.quantity,
                    last_updated = CURRENT_TIMESTAMP
            `).bind(nodeId, sku, qty)
        );

        totalQty += qty;
    }

    if (statements.length === 0) {
        return new Response(JSON.stringify({ error: "No se encontraron datos válidos." }), { status: 400 });
    }

    await db.batch(statements);

    return new Response(JSON.stringify({ 
        status: "success", 
        message: `Se ingresaron exitosamente ${totalQty} unidades.` 
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
