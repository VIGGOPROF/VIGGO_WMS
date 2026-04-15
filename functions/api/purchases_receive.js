export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const { oc_number, sku, qty_received, node_id } = await context.request.json();

    const qty = parseInt(qty_received, 10);
    const node = parseInt(node_id, 10);

    if (!oc_number || !sku || isNaN(qty) || isNaN(node) || qty <= 0) {
      return new Response(JSON.stringify({ error: "Datos de recepción incompletos o inválidos." }), { status: 400 });
    }

    // 1. Buscar el ID real del producto usando el SKU
    const prod = await db.prepare('SELECT id FROM products WHERE sku = ?').bind(sku.trim()).first();
    if (!prod) {
      return new Response(JSON.stringify({ error: `El SKU ${sku} no existe en el Catálogo de VIGGO.` }), { status: 400 });
    }
    const productId = parseInt(prod.id, 10);

    const statements = [];

    // 2. Actualizar la cantidad recibida en la Orden de Compra
    statements.push(
      db.prepare(`
        UPDATE purchase_order_items 
        SET qty_received = qty_received + ? 
        WHERE oc_number = ? AND sku = ?
      `).bind(qty, oc_number, sku)
    );

    // 3. Inyectar el stock Físico en el Hub de Origen (China Central o Depósito Fábrica)
    statements.push(
      db.prepare(`
        INSERT INTO inventory (product_id, node_id, quantity) 
        VALUES (?, ?, ?)
        ON CONFLICT(product_id, node_id) DO UPDATE SET quantity = quantity + excluded.quantity
      `).bind(productId, node, qty)
    );

    // 4. Lógica para verificar si la Orden de Compra entera ya se completó
    // (Esto se dispara en segundo plano actualizando el estado de la OC a 'Parcial' o 'Completada')
    statements.push(
      db.prepare(`
        UPDATE purchase_orders 
        SET status = CASE 
            WHEN (SELECT SUM(qty_ordered - qty_received) FROM purchase_order_items WHERE oc_number = ?) <= 0 THEN 'Completada'
            ELSE 'Parcial'
        END
        WHERE oc_number = ?
      `).bind(oc_number, oc_number)
    );

    await db.batch(statements);

    return new Response(JSON.stringify({ status: "success", message: `Se ingresaron ${qty} unidades de ${sku} exitosamente.` }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Error de BD: " + error.message }), { status: 500 });
  }
}
