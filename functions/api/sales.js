export async function onRequestGet(context) {
    const db = context.env.DB;
    try {
        // Traemos todos los remitos que están esperando ser armados/facturados
        const { results } = await db.prepare(`
            SELECT s.id, s.reference_doc, s.total_amount, s.sale_date, c.business_name, c.id as client_id
            FROM sales s
            JOIN clients c ON s.client_id = c.id
            WHERE s.status = 'PENDIENTE'
            ORDER BY s.id DESC
        `).all();

        // Le pegamos a cada uno sus artículos correspondientes
        for (let sale of results) {
            const { results: items } = await db.prepare(`SELECT sku, product_name as name, quantity as qty, unit_price as price FROM sale_items WHERE sale_id = ?`).bind(sale.id).all();
            sale.items = items;
        }
        return new Response(JSON.stringify({ data: results }), { headers: { "Content-Type": "application/json" } });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const { clientId, items, userId, action, saleId } = await context.request.json();
    // 'action' dirá si es 'PENDIENTE' (Remito) o 'FACTURADO' (Venta real)

    if (!clientId || !items || items.length === 0) {
      return new Response(JSON.stringify({ error: "Faltan datos del cliente o el carrito está vacío." }), { status: 400 });
    }

    const client = await db.prepare('SELECT node_id, business_name FROM clients WHERE id = ?').bind(clientId).first();
    if (!client) return new Response(JSON.stringify({ error: "Cliente no válido." }), { status: 400 });

    const statements = [];
    let finalSaleId = saleId;

    // Si estamos editando o facturando un remito existente, PRIMERO restauramos el stock viejo
    if (saleId) {
        const { results: oldItems } = await db.prepare(`
            SELECT si.quantity, p.id as product_id 
            FROM sale_items si 
            JOIN products p ON si.sku = p.sku 
            WHERE si.sale_id = ?
        `).bind(saleId).all();

        for(let old of oldItems) {
            statements.push(db.prepare('UPDATE inventory SET quantity = quantity + ? WHERE product_id = ? AND node_id = ?').bind(old.quantity, old.product_id, client.node_id));
        }
        // Borramos los ítems viejos para poner los nuevos revisados
        statements.push(db.prepare('DELETE FROM sale_items WHERE sale_id = ?').bind(saleId));
    } 
    // Si es un pedido 100% nuevo, creamos la cabecera
    else {
        const headerInfo = await db.prepare(`INSERT INTO sales (client_id, total_amount, user_id, status) VALUES (?, 0, ?, ?)`).bind(clientId, userId, action).run();
        finalSaleId = headerInfo.meta.last_row_id;
        const tempDoc = `REM-${finalSaleId.toString().padStart(5, '0')}`;
        await db.prepare(`UPDATE sales SET reference_doc = ? WHERE id = ?`).bind(tempDoc, finalSaleId).run();
    }

    let newTotal = 0;
    const processedItems = [];
    
    // Aplicamos los ítems del carrito (descontando el stock exacto ajustado)
    for (const item of items) {
        const prod = await db.prepare(`SELECT p.id, p.name, COALESCE(pr.price, 0) as price FROM products p LEFT JOIN prices pr ON p.id = pr.product_id AND pr.node_id = ? WHERE p.sku = ?`).bind(client.node_id, item.sku).first();
        if(prod) {
            const subtotal = prod.price * item.qty;
            newTotal += subtotal;
            processedItems.push({ sku: item.sku, name: prod.name, qty: item.qty, price: prod.price, subtotal });

            statements.push(db.prepare(`INSERT INTO sale_items (sale_id, sku, product_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`).bind(finalSaleId, item.sku, prod.name, item.qty, prod.price));
            statements.push(db.prepare(`UPDATE inventory SET quantity = quantity - ? WHERE product_id = ? AND node_id = ?`).bind(item.qty, prod.id, client.node_id));
        }
    }

    const finalDocRef = `REM-${finalSaleId.toString().padStart(5, '0')}`;

    // Actualizamos el monto total y cerramos el estado según el botón que presionaste
    statements.push(db.prepare(`UPDATE sales SET total_amount = ?, status = ? WHERE id = ?`).bind(newTotal, action, finalSaleId));

    // SI Y SÓLO SI presionaste "Facturar", le generamos la deuda en la cuenta corriente
    if (action === 'FACTURADO') {
        statements.push(db.prepare(`INSERT INTO client_transactions (client_id, transaction_type, amount, reference_doc, user_id) VALUES (?, 'VENTA', ?, ?, ?)`).bind(clientId, newTotal, finalDocRef, userId));
        statements.push(db.prepare(`INSERT INTO audit_logs (user_id, action_type, description) VALUES (?, 'FACTURACION', ?)`).bind(userId, `Facturó ${finalDocRef} a ${client.business_name} por $${newTotal}`));
    } else {
        // Solo auditoría de remito
        statements.push(db.prepare(`INSERT INTO audit_logs (user_id, action_type, description) VALUES (?, 'REMITO_BORRADOR', ?)`).bind(userId, `Generó/Editó Remito ${finalDocRef} para ${client.business_name}`));
    }

    if (statements.length > 0) {
        await db.batch(statements);
    }

    return new Response(JSON.stringify({ 
      status: "success", 
      message: action === 'FACTURADO' ? `Venta facturada. Total: $${newTotal}` : `Remito ${finalDocRef} guardado. Stock reservado.`,
      docRef: finalDocRef,
      items: processedItems,
      total: newTotal
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Error de BD: " + error.message }), { status: 500 });
  }
}

// Endpoint para cancelar/borrar un Remito por completo
export async function onRequestDelete(context) {
    try {
        const db = context.env.DB;
        const url = new URL(context.request.url);
        const saleId = url.searchParams.get('id');

        const sale = await db.prepare('SELECT client_id, status FROM sales WHERE id = ?').bind(saleId).first();
        if(!sale || sale.status === 'FACTURADO') return new Response(JSON.stringify({error: "No se puede eliminar una venta ya facturada."}), {status: 400});

        const client = await db.prepare('SELECT node_id FROM clients WHERE id = ?').bind(sale.client_id).first();
        const { results: items } = await db.prepare(`SELECT si.quantity, p.id as product_id FROM sale_items si JOIN products p ON si.sku = p.sku WHERE si.sale_id = ?`).bind(saleId).all();

        const statements = [];
        // Devolvemos el stock a la normalidad
        for(let item of items) {
             statements.push(db.prepare('UPDATE inventory SET quantity = quantity + ? WHERE product_id = ? AND node_id = ?').bind(item.quantity, item.product_id, client.node_id));
        }
        statements.push(db.prepare('DELETE FROM sale_items WHERE sale_id = ?').bind(saleId));
        statements.push(db.prepare('DELETE FROM sales WHERE id = ?').bind(saleId));

        await db.batch(statements);
        return new Response(JSON.stringify({status: 'success'}));
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
