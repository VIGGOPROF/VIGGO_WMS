export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const { clientId, items, userId } = await context.request.json();

    if (!clientId || !items || items.length === 0) {
      return new Response(JSON.stringify({ error: "Faltan datos del cliente o el carrito está vacío." }), { status: 400 });
    }

    // 1. Obtener la sede (país) del cliente
    const client = await db.prepare('SELECT node_id, business_name FROM clients WHERE id = ?').bind(clientId).first();
    if (!client) return new Response(JSON.stringify({ error: "Cliente no válido." }), { status: 400 });

    const nodeId = client.node_id;
    let totalSaleAmount = 0;
    const processedItems = [];
    const statements = [];

    // 2. Generar Cabecera de la Venta (Reservamos el ID)
    const saleResult = await db.prepare(`INSERT INTO sales (client_id, total_amount, user_id) VALUES (?, 0, ?) RETURNING id`).bind(clientId, userId).first();
    const saleId = saleResult.id;

    // 3. Procesar cada ítem del carrito
    for (const item of items) {
      const sku = item.sku.trim();
      const qty = parseInt(item.qty, 10);
      if (!sku || isNaN(qty) || qty <= 0) continue;

      // Buscar ID del producto, nombre y su precio oficial en ese país
      const query = `
        SELECT p.id as product_id, p.name, COALESCE(pr.price, 0) as price 
        FROM products p
        LEFT JOIN prices pr ON p.id = pr.product_id AND pr.node_id = ?
        WHERE p.sku = ?
      `;
      const prod = await db.prepare(query).bind(nodeId, sku).first();

      if (prod) {
        const subtotal = prod.price * qty;
        totalSaleAmount += subtotal;

        processedItems.push({ sku, name: prod.name, qty, price: prod.price, subtotal });

        // A. Guardar detalle de la venta
        statements.push(db.prepare(`INSERT INTO sale_items (sale_id, sku, product_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`).bind(saleId, sku, prod.name, qty, prod.price));

        // B. Descontar Stock Físico
        statements.push(db.prepare(`UPDATE inventory SET quantity = quantity - ? WHERE product_id = ? AND node_id = ?`).bind(qty, prod.product_id, nodeId));
      }
    }

    if (processedItems.length === 0) {
      return new Response(JSON.stringify({ error: "Ningún SKU válido fue procesado." }), { status: 400 });
    }

    // 4. Actualizar total de la venta
    statements.push(db.prepare(`UPDATE sales SET total_amount = ? WHERE id = ?`).bind(totalSaleAmount, saleId));

    // 5. Impactar Cuenta Corriente (Generar Deuda)
    const docRef = `REM-${saleId.toString().padStart(5, '0')}`;
    statements.push(db.prepare(`INSERT INTO client_transactions (client_id, transaction_type, amount, reference_doc, user_id) VALUES (?, 'VENTA', ?, ?, ?)`).bind(clientId, totalSaleAmount, docRef, userId));

    // 6. Auditoría
    statements.push(db.prepare(`INSERT INTO audit_logs (user_id, action_type, description) VALUES (?, 'VENTA_POS', ?)`).bind(userId, `Facturó ${docRef} a ${client.business_name} por $${totalSaleAmount}`));

    // Ejecutar transacción masiva
    await db.batch(statements);

    return new Response(JSON.stringify({ 
      status: "success", 
      message: `Venta registrada. Total: $${totalSaleAmount}`,
      saleId: saleId,
      docRef: docRef,
      items: processedItems,
      total: totalSaleAmount
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Error de BD: " + error.message }), { status: 500 });
  }
}
