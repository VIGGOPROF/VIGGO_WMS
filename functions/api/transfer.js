export async function onRequestPost(context) {
  try {
    const data = await context.request.json();
    const db = context.env.DB;

    const origenId = parseInt(data.origen);
    const destinoId = parseInt(data.destino);
    const transId = parseInt(data.transporte);
    const items = data.items; // Lista de productos del Excel

    if (!items || items.length === 0) {
        return new Response(JSON.stringify({ error: "No hay productos válidos para transferir." }), { status: 400 });
    }

    // 1. Calcular Fecha de Llegada (ETA)
    const transQuery = await db.prepare("SELECT avg_days_lead FROM transport_methods WHERE id = ?").bind(transId).first();
    const daysLead = transQuery ? transQuery.avg_days_lead : 0;
    const etaDate = new Date();
    etaDate.setDate(new Date().getDate() + daysLead);

    // 2. Crear la Cabecera del Despacho (Genera el ID de Transferencia)
    const transferRes = await db.prepare(`
      INSERT INTO transfers (origin_node_id, destination_node_id, transport_method_id, status, dispatch_date, estimated_arrival)
      VALUES (?, ?, ?, 'in_transit', CURRENT_TIMESTAMP, ?) RETURNING id
    `).bind(origenId, destinoId, transId, etaDate.toISOString()).first();

    const transferId = transferRes.id;
    const statements = [];
    let totalInvoice = 0;

    // 3. Iterar sobre cada fila del Excel
    for (const item of items) {
        // Leer nombre de columna flexible
        const rawSku = item.SKU || item.sku || item.Sku;
        if (!rawSku) continue;
        const sku = rawSku.toString().trim();
        const qty = parseInt(item.Cantidad || item.cantidad);
        if (!qty || qty <= 0) continue;

        // A. Verificar Stock en Origen
        const stockQuery = await db.prepare(`
          SELECT p.id as product_id, i.quantity 
          FROM products p
          LEFT JOIN inventory i ON p.id = i.product_id AND i.node_id = ?
          WHERE p.sku = ?
        `).bind(origenId, sku).first();

        if (!stockQuery || !stockQuery.product_id) {
            await db.prepare("DELETE FROM transfers WHERE id = ?").bind(transferId).run(); // Abortar
            return new Response(JSON.stringify({ error: `El SKU ${sku} no existe en la base de datos.` }), { status: 404 });
        }
        if (stockQuery.quantity < qty) {
            await db.prepare("DELETE FROM transfers WHERE id = ?").bind(transferId).run(); // Abortar
            return new Response(JSON.stringify({ error: `Stock físico insuficiente para el SKU ${sku}.` }), { status: 400 });
        }

        const productId = stockQuery.product_id;

        // B. Buscar Precio en Lista de Destino para la Proforma
        const priceQuery = await db.prepare(`
          SELECT pli.price FROM price_list_items pli
          JOIN price_lists pl ON pli.price_list_id = pl.id
          WHERE pl.node_id = ? AND pli.product_id = ?
        `).bind(destinoId, productId).first();
        
        const unitPrice = priceQuery ? priceQuery.price : 0;
        totalInvoice += (unitPrice * qty);

        // C. Preparar los movimientos en lote
        statements.push(db.prepare("UPDATE inventory SET quantity = quantity - ? WHERE node_id = ? AND product_id = ?").bind(qty, origenId, productId));
        
        statements.push(db.prepare(`
          INSERT INTO inventory (node_id, product_id, reserved_quantity) 
          VALUES (?, ?, ?) ON CONFLICT(node_id, product_id) DO UPDATE SET reserved_quantity = reserved_quantity + ?
        `).bind(destinoId, productId, qty, qty));
        
        // Guardar el ítem en la transferencia (Para que luego el módulo "Documentos" pueda imprimir el PDF)
        statements.push(db.prepare(`
          INSERT INTO transfer_items (transfer_id, product_id, quantity, unit_price_at_transfer)
          VALUES (?, ?, ?, ?)
        `).bind(transferId, productId, qty, unitPrice));
    }

    if (statements.length === 0) {
        await db.prepare("DELETE FROM transfers WHERE id = ?").bind(transferId).run();
        return new Response(JSON.stringify({ error: "El Excel no tenía el formato correcto." }), { status: 400 });
    }

    // 4. Ejecutar todo de golpe
    await db.batch(statements);

    return new Response(JSON.stringify({ 
        status: "success", 
        message: `Orden #${transferId} despachada.`,
        eta: etaDate.toISOString().split('T')[0],
        total_invoice: totalInvoice
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
