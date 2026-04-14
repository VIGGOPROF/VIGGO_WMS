export async function onRequestPost(context) {
  try {
    const data = await context.request.json();
    const db = context.env.DB;

    // 1. Validaciones iniciales
    const origenId = parseInt(data.origen);
    const destinoId = parseInt(data.destino);
    const transId = parseInt(data.transporte);
    const sku = data.sku.trim();
    const qty = parseInt(data.qty);

    // 2. Buscar ID del producto y verificar stock en origen
    const stockQuery = await db.prepare(`
      SELECT p.id as product_id, i.quantity 
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id AND i.node_id = ?
      WHERE p.sku = ?
    `).bind(origenId, sku).first();

    if (!stockQuery || !stockQuery.product_id) {
        return new Response(JSON.stringify({ error: "El SKU no existe en el catálogo." }), { status: 404 });
    }
    if (stockQuery.quantity < qty) {
        return new Response(JSON.stringify({ error: `Stock insuficiente en origen. Disponible: ${stockQuery.quantity || 0}` }), { status: 400 });
    }

    const productId = stockQuery.product_id;

    // 3. Obtener precio de la lista del Nodo Destino (Manejo de Facturación)
    // Si no tiene precio asignado, usamos un valor base de 0 para no frenar la operativa
    const priceQuery = await db.prepare(`
      SELECT pli.price 
      FROM price_list_items pli
      JOIN price_lists pl ON pli.price_list_id = pl.id
      WHERE pl.node_id = ? AND pli.product_id = ?
    `).bind(destinoId, productId).first();
    
    const unitPrice = priceQuery ? priceQuery.price : 0;
    const totalInvoice = unitPrice * qty;

    // 4. Obtener días de transporte para calcular el ETA
    const transQuery = await db.prepare("SELECT avg_days_lead FROM transport_methods WHERE id = ?").bind(transId).first();
    const daysLead = transQuery ? transQuery.avg_days_lead : 0;
    
    // Cálculo de ETA sumando los días a hoy
    const dispatchDate = new Date();
    const etaDate = new Date();
    etaDate.setDate(dispatchDate.getDate() + daysLead);

    // 5. Preparar la transacción (Batch) para mover el stock de forma segura
    const statements = [
        // A. Restar stock del nodo origen
        db.prepare("UPDATE inventory SET quantity = quantity - ? WHERE node_id = ? AND product_id = ?").bind(qty, origenId, productId),
        
        // B. Sumar stock 'reservado' (en tránsito) al nodo destino
        db.prepare(`
          INSERT INTO inventory (node_id, product_id, reserved_quantity) 
          VALUES (?, ?, ?)
          ON CONFLICT(node_id, product_id) DO UPDATE SET reserved_quantity = reserved_quantity + ?
        `).bind(destinoId, productId, qty, qty),

        // C. Registrar la transferencia histórica (Auditoría)
        db.prepare(`
          INSERT INTO transfers (origin_node_id, destination_node_id, transport_method_id, status, dispatch_date, estimated_arrival)
          VALUES (?, ?, ?, 'in_transit', datetime('now'), ?)
        `).bind(origenId, destinoId, transId, etaDate.toISOString())
    ];

    await db.batch(statements);

    return new Response(JSON.stringify({ 
        status: "success", 
        message: `Orden despachada. Stock movido a tránsito.`,
        eta: etaDate.toISOString().split('T')[0], // Formato YYYY-MM-DD
        total_invoice: totalInvoice
    }), { 
        headers: { "Content-Type": "application/json" } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
