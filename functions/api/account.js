export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    const url = new URL(context.request.url);
    const clientId = url.searchParams.get('client_id');

    if (!clientId) {
      return new Response(JSON.stringify({ error: "Falta especificar el cliente." }), { status: 400 });
    }

    // 1. Buscamos los datos básicos del cliente
    const client = await db.prepare(`
      SELECT c.*, n.name as node_name 
      FROM clients c 
      JOIN nodes n ON c.node_id = n.id 
      WHERE c.id = ?
    `).bind(clientId).first();

    if (!client) {
      return new Response(JSON.stringify({ error: "Cliente no encontrado." }), { status: 404 });
    }

    // 2. Buscamos TODO su historial de transacciones, ordenado de más viejo a más nuevo
    const { results } = await db.prepare(`
      SELECT * FROM client_transactions 
      WHERE client_id = ? 
      ORDER BY created_at ASC
    `).bind(clientId).all();

    return new Response(JSON.stringify({ status: "success", client, transactions: results }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Error de BD: " + error.message }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const { clientId, amount, referenceDoc, notes, userId } = await context.request.json();

    if (!clientId || !amount || amount <= 0) {
      return new Response(JSON.stringify({ error: "Datos inválidos. El monto a pagar debe ser mayor a 0." }), { status: 400 });
    }

    // TRUCO MATEMÁTICO: Las ventas se guardan en POSITIVO. Los pagos deben guardarse en NEGATIVO.
    const paymentAmount = -Math.abs(parseFloat(amount));
    const ref = referenceDoc ? referenceDoc.trim().toUpperCase() : 'S/R';

    const statements = [];
    
    // 1. Guardar el pago
    statements.push(db.prepare(`
      INSERT INTO client_transactions (client_id, transaction_type, amount, reference_doc, notes, user_id) 
      VALUES (?, 'PAGO', ?, ?, ?, ?)
    `).bind(clientId, paymentAmount, ref, notes || '', userId));

    // 2. Registro de Auditoría
    if (userId) {
       statements.push(db.prepare(`
         INSERT INTO audit_logs (user_id, action_type, description) 
         VALUES (?, 'PAGO_RECIBIDO', ?)
       `).bind(userId, `Registró pago de $${Math.abs(paymentAmount)} (Ref: ${ref}) para cliente ID ${clientId}`));
    }

    await db.batch(statements);

    return new Response(JSON.stringify({ status: "success", message: "Pago registrado exitosamente. Saldo actualizado." }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Error de BD: " + error.message }), { status: 500 });
  }
}
