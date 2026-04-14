export async function onRequestPost(context) {
  try {
    const data = await context.request.json();
    const db = context.env.DB;

    // 1. Garantizar que el Nodo 1 (China Central) exista antes de cargar stock
    await db.prepare("INSERT OR IGNORE INTO nodes (id, name, country_code, is_origin) VALUES (1, 'China Central', 'CN', 1)").run();

    const statements = [];

    // 2. Iterar sobre cada fila del Excel
    for (const item of data) {
      // Validar que la fila tenga al menos el SKU
      if (!item.SKU) continue;

      const sku = item.SKU.toString();
      const name = item.Nombre || 'Sin Nombre';
      const category = item.Categoria || 'General';
      const quantity = parseInt(item.Cantidad) || 0;

      // A. Insertar el producto en el catálogo general (Si ya existe el SKU, lo ignora)
      statements.push(
        db.prepare("INSERT OR IGNORE INTO products (sku, name, category) VALUES (?, ?, ?)")
          .bind(sku, name, category)
      );

      // B. Actualizar el inventario del Nodo 1 (China)
      // Esta query busca el ID del producto por su SKU y suma la cantidad. 
      // Si el registro de inventario ya existe, lo actualiza (UPSERT).
      statements.push(
        db.prepare(`
          INSERT INTO inventory (node_id, product_id, quantity)
          SELECT 1, id, ? FROM products WHERE sku = ?
          ON CONFLICT(node_id, product_id) DO UPDATE SET quantity = quantity + excluded.quantity, last_updated = CURRENT_TIMESTAMP
        `).bind(quantity, sku)
      );
    }

    // 3. Ejecutar todas las consultas de golpe (mucho más rápido que una por una)
    await db.batch(statements);

    return new Response(JSON.stringify({ 
        status: "success", 
        message: `Se procesaron e ingresaron ${data.length} líneas de stock en origen.` 
    }), { 
        headers: { "Content-Type": "application/json" } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
