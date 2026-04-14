export async function onRequestPost(context) {
  try {
    const data = await context.request.json();
    const db = context.env.DB;
    const items = data.items;

    if (!items || items.length === 0) return new Response("Sin datos", { status: 400 });

    const statements = [];
    for (const item of items) {
        let sku = '', name = '', category = '', factory = '', order = 999;
        
        // Búsqueda de columnas inteligente (ignora mayúsculas y espacios invisibles)
        for (const key in item) {
            const k = key.trim().toLowerCase();
            if (k === 'sku') sku = item[key].toString().trim();
            if (k === 'nombre' || k === 'name' || k === 'producto') name = item[key].toString().trim();
            if (k === 'categoria' || k === 'categoría') category = item[key].toString().trim();
            if (k === 'fabrica' || k === 'fábrica') factory = item[key].toString().trim();
            if (k === 'orden' || k === 'order') order = parseInt(item[key]) || 999;
        }

        if (!sku) continue;
        
        // Si a pesar de todo el nombre viene vacío, usamos el SKU como red de seguridad
        const finalName = name !== '' ? name : sku;

        // Crear la fábrica dinámicamente si no existe
        if (factory) {
            statements.push(db.prepare("INSERT OR IGNORE INTO factories (name) VALUES (?)").bind(factory));
        }

        // Catálogo Maestro: FORZAMOS la sobreescritura total con la información del Excel
        statements.push(
            db.prepare(`
                INSERT INTO products (sku, name, category, factory_name, display_order) 
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(sku) DO UPDATE SET 
                    name = excluded.name,
                    category = excluded.category,
                    factory_name = excluded.factory_name,
                    display_order = excluded.display_order
            `).bind(sku, finalName, category, factory, order)
        );
    }

    await db.batch(statements);
    return new Response(JSON.stringify({ success: true, message: `Catálogo de ${items.length} artículos actualizado perfectamente.` }));
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
