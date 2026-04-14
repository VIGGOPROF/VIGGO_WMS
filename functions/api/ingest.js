export async function onRequestPost(context) {
  try {
    const data = await context.request.json();
    const db = context.env.DB;

    // 1. Garantizar que el Nodo 1 exista
    await db.prepare("INSERT OR IGNORE INTO nodes (id, name, country_code, is_origin) VALUES (1, 'China Central', 'CN', 1)").run();

    const statements = [];

    // 2. Iterar sobre cada fila del Excel
    for (const item of data) {
      // Hacemos la lectura de columnas más flexible (acepta mayúsculas o minúsculas)
      const rawSku = item.SKU || item.sku || item.Sku;
      
      // Si la fila realmente no tiene SKU, la saltamos
      if (!rawSku) continue;

      const sku = rawSku.toString().trim();
      const name = item.Nombre || item.nombre || 'Sin Nombre';
      const category = item.Categoria || item.categoria || 'General';
      const quantity = parseInt(item.Cantidad || item.cantidad) || 0;

      statements.push(
        db.prepare("INSERT OR IGNORE INTO products (sku, name, category) VALUES (?, ?, ?)").bind(sku, name, category)
      );

      statements.push(
        db.prepare(`
          INSERT INTO inventory (node_id, product_id, quantity)
          SELECT 1, id, ? FROM products WHERE sku = ?
          ON CONFLICT(node_id, product_id) DO UPDATE SET quantity = quantity + excluded.quantity, last_updated = CURRENT_TIMESTAMP
        `).bind(quantity, sku)
      );
    }

    // 3. LA CLAVE DEL ARREGLO: Verificar que haya datos antes de enviar a D1
    if (statements.length === 0) {
      return new Response(JSON.stringify({ 
          error: "No se encontraron productos para cargar. Verifica que el Excel tenga la columna 'SKU'." 
      }), { 
          status: 400, 
          headers: { "Content-Type": "application/json" } 
      });
    }

    // 4. Ejecutar todas las consultas de golpe
    await db.batch(statements);

    return new Response(JSON.stringify({ 
        status: "success", 
        message: `Se ingresaron correctamente los productos en el stock de origen.` 
    }), { 
        headers: { "Content-Type": "application/json" } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
