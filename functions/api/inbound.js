export async function onRequestPost(context) {
  try {
    const data = await context.request.json();
    const db = context.env.DB;

    const nodeId = parseInt(data.nodeId);
    const items = data.items; // Siempre esperamos un array, sea de 1 o de 100 items

    if (!nodeId || !items || items.length === 0) {
        return new Response(JSON.stringify({ error: "Datos incompletos para el ingreso." }), { status: 400 });
    }

    const statements = [];
    let totalQty = 0;

    for (const item of items) {
        // Normalizar nombres de columnas (por si en el Excel vienen en mayúsculas o sin tilde)
        const sku = (item.SKU || item.sku || '').toString().trim();
        const name = (item.Nombre || item.nombre || item.name || '').toString().trim();
        const category = (item.Categoria || item.Categoría || item.category || '').toString().trim();
        const factory = (item.Fabrica || item.Fábrica || item.factory || '').toString().trim();
        const qty = parseInt(item.Cantidad || item.cantidad || item.qty);

        if (!sku || !qty || qty <= 0) continue;

        // 1. Crear o Actualizar el Producto (Upsert)
        // Si el SKU ya existe, solo actualizamos su categoría y fábrica para mantener la BD limpia.
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

        // 2. Sumar el Stock físico al Nodo seleccionado
        // Usamos una subconsulta para obtener el product_id dinámicamente
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
        return new Response(JSON.stringify({ error: "No se encontraron datos válidos para procesar." }), { status: 400 });
    }

    // Ejecutar todas las consultas en bloque
    await db.batch(statements);

    return new Response(JSON.stringify({ 
        status: "success", 
        message: `Se ingresaron exitosamente ${totalQty} unidades al depósito seleccionado.` 
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
