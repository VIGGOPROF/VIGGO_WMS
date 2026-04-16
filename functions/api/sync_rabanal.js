export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const body = await request.json();
        const db = env.DB; // Asegúrate de que tu variable de entorno en Cloudflare se llame "DB"
        
        let newCount = 0;
        let updateCount = 0;

        if (!body.items || !Array.isArray(body.items)) {
            return new Response(JSON.stringify({ error: "El archivo no contiene artículos válidos." }), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // ID del depósito de Argentina HQ (Asumimos que es el 2, cámbialo si tu base de datos usa otro ID)
        const NODE_ID_ARGENTINA = 2;

        for (const item of body.items) {
            // 1. Buscar si el producto ya existe en el Catálogo Maestro
            let product = await db.prepare("SELECT id FROM products WHERE sku = ?").bind(item.sku).first();
            let productId;

            if (!product) {
                // Si no existe, lo creamos. D1 devuelve el ID en 'meta.last_row_id'
                const insertInfo = await db.prepare(
                    "INSERT INTO products (sku, name) VALUES (?, ?)"
                ).bind(item.sku, item.name).run();
                
                productId = insertInfo.meta.last_row_id;
                newCount++;
            } else {
                productId = product.id;
            }

            // 2. Verificar si ya hay una fila de inventario para este producto en Argentina
            const inv = await db.prepare(
                "SELECT id FROM inventory WHERE product_id = ? AND node_id = ?"
            ).bind(productId, NODE_ID_ARGENTINA).first();

            if (inv) {
                // Si ya existe, actualizamos solo el stock físico
                await db.prepare(
                    "UPDATE inventory SET physical_stock = ? WHERE id = ?"
                ).bind(item.stock, inv.id).run();
                updateCount++;
            } else {
                // Si no existe inventario en esta sede, creamos la fila inicial en 0 tránsito
                await db.prepare(
                    "INSERT INTO inventory (product_id, node_id, physical_stock, transit_stock) VALUES (?, ?, ?, 0)"
                ).bind(productId, NODE_ID_ARGENTINA, item.stock).run();
                updateCount++;
            }
        }

        // Devolvemos el éxito al frontend para que pinte las tarjetitas de estadísticas
        return new Response(JSON.stringify({ 
            success: true, 
            new_items: newCount, 
            updated_items: updateCount 
        }), { 
            status: 200,
            headers: { 'Content-Type': 'application/json' } 
        });

    } catch (error) {
        // Capturamos cualquier error de la base de datos y lo mandamos al frontend
        return new Response(JSON.stringify({ error: error.message }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
}
