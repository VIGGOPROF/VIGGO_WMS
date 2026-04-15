export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const { origen, destino, transporte, containerNumber, items, userId } = await context.request.json();

    if (!origen || !destino || !items || items.length === 0) {
      return new Response(JSON.stringify({ error: "Datos incompletos para el despacho." }), { status: 400 });
    }

    // 1. Calcular tiempos logísticos
    const daysToPort = transporte === 'avion' ? 15 : 60;
    const clearanceDays = 7; // Días de aduana y flete interno
    
    const today = new Date();
    
    // ETA a Puerto
    const etaPortDate = new Date(today);
    etaPortDate.setDate(etaPortDate.getDate() + daysToPort);
    const estimatedArrival = etaPortDate.toISOString().split('T')[0];

    // Fecha de Disponibilidad en Depósito (+7 días)
    const availDate = new Date(etaPortDate);
    availDate.setDate(availDate.getDate() + clearanceDays);
    const availabilityDate = availDate.toISOString().split('T')[0];

    let totalInvoice = 0;
    const container = containerNumber ? containerNumber.trim().toUpperCase() : 'PENDIENTE';

    // 2. Crear la cabecera de la transferencia (Incluye Contenedor y Disponibilidad)
    const transferResult = await db.prepare(`
      INSERT INTO transfers (origin_node_id, destination_node_id, status, estimated_arrival, container_number, availability_date) 
      VALUES (?, ?, 'in_transit', ?, ?, ?) RETURNING id
    `).bind(origen, destino, estimatedArrival, container, availabilityDate).first();

    const transferId = transferResult.id;
    const statements = [];

    // 3. Procesar cada producto del Packing List
    for (const row of items) {
      let sku = row.SKU || row.sku;
      let qty = parseInt(row.Cantidad || row.cantidad || row.Qty || row.qty, 10);
      
      if (!sku || isNaN(qty)) continue;

      const prod = await db.prepare('SELECT id, name FROM products WHERE sku = ?').bind(sku.trim()).first();
      if (!prod) continue; // Si no existe, lo ignora

      const priceResult = await db.prepare('SELECT price FROM prices WHERE product_id = ? AND node_id = ?').bind(prod.id, destino).first();
      const unitPrice = priceResult ? priceResult.price : 0;
      totalInvoice += (unitPrice * qty);

      // Descontar del origen
      statements.push(db.prepare(`UPDATE inventory SET quantity = quantity - ? WHERE product_id = ? AND node_id = ?`).bind(qty, prod.id, origen));
      
      // Registrar el ítem en tránsito
      statements.push(db.prepare(`INSERT INTO transfer_items (transfer_id, product_id, quantity, price) VALUES (?, ?, ?, ?)`).bind(transferId, prod.id, qty, unitPrice));
    }

    // 4. Registro de Auditoría
    if (userId) {
       const desc = `Despachó contenedor ${container} (${items.length} líneas) de Nodo ${origen} a Nodo ${destino}`;
       statements.push(
           db.prepare(`INSERT INTO audit_logs (user_id, action_type, description) VALUES (?, 'DESPACHO', ?)`)
             .bind(userId, desc)
       );
    }

    await db.batch(statements);

    return new Response(JSON.stringify({ 
      status: "success", 
      message: `Despacho asignado al Contenedor ${container}.`, 
      eta: estimatedArrival, 
      availability: availabilityDate,
      total_invoice: totalInvoice 
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Error de BD: " + error.message }), { status: 500 });
  }
}
