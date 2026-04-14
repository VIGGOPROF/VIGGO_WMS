export async function onRequestPost(context) {
  try {
    const data = await context.request.json();
    const db = context.env.DB;
    const items = data.items;

    if (!items || items.length === 0) return new Response("Sin datos", { status: 400 });

    const statements = [];
    for (const item of items) {
        const sku = (item.SKU || item.sku || '').toString().trim();
        const name = (item.Nombre || item.nombre || item.name || '').toString().trim();
        const category = (item.Categoria || item.Categoría || '').toString().trim();
        const factory = (item.Fabrica || item.Fábrica || '').toString().trim();
        const order = parseInt(item.Orden || item.orden || 999);

        if (!sku) continue;

        if (factory) {
            statements.push(db.prepare("INSERT OR IGNORE INTO factories (name) VALUES (?)").bind(factory));
        }

        statements.push(
            db.prepare(`
                INSERT INTO products (sku, name, category, factory_name, display_order) 
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(sku) DO UPDATE SET 
                    name = COALESCE(NULLIF(excluded.name, excluded.sku), NULLIF(excluded.name, ''), products.name),
                    category = COALESCE(NULLIF(excluded.category, ''), products.category),
                    factory_name = COALESCE(NULLIF(excluded.factory_name, ''), products.factory_name),
                    display_order = excluded.display_order
            `).bind(sku, name || sku, category, factory, order)
        );
    }

    await db.batch(statements);
    return new Response(JSON.stringify({ success: true, message: `Catálogo actualizado.` }));
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
