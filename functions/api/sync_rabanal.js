// LÓGICA PARA EL WORKER (ENDPOINT: /api/sync_rabanal)
let newCount = 0;
let updateCount = 0;

for (const item of requestData.items) {
    // 1. Intentamos buscar el producto
    let product = await db.prepare("SELECT id FROM products WHERE sku = ?").bind(item.sku).first();
    
    // 2. Si no existe, lo CREAMOS en el catálogo
    if (!product) {
        const insertRes = await db.prepare("INSERT INTO products (sku, name) VALUES (?, ?) RETURNING id").bind(item.sku, item.name).first();
        product = { id: insertRes.id };
        newCount++;
    }

    // 3. Verificamos si ya hay stock para ese producto en Argentina HQ (Asumiendo que Node ID 2 = Argentina)
    let inventory = await db.prepare("SELECT id FROM inventory WHERE product_id = ? AND node_id = 2").bind(product.id).first();

    // 4. Si hay stock previo, LO ACTUALIZAMOS, si no, LO INSERTAMOS
    if (inventory) {
        await db.prepare("UPDATE inventory SET quantity = ? WHERE product_id = ? AND node_id = 2").bind(item.stock, product.id).run();
        updateCount++;
    } else {
        await db.prepare("INSERT INTO inventory (product_id, node_id, quantity) VALUES (?, 2, ?)").bind(product.id, item.stock).run();
        updateCount++;
    }
}

// Retornamos al frontend:
return Response.json({ success: true, new_items: newCount, updated_items: updateCount });
