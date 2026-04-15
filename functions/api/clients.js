export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    
    // Traemos todos los datos del cliente, nodo y saldo
    const query = `
      SELECT 
        c.*, 
        n.name as node_name,
        COALESCE((SELECT SUM(amount) FROM client_transactions WHERE client_id = c.id), 0) as current_balance
      FROM clients c
      JOIN nodes n ON c.node_id = n.id
      ORDER BY c.business_name ASC
    `;

    const { results } = await db.prepare(query).all();
    return new Response(JSON.stringify({ status: "success", data: results }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Error de BD: " + error.message }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const data = await context.request.json();

    if (!data.business_name || !data.tax_id || !data.node_id) {
      return new Response(JSON.stringify({ error: "Razón Social, Identificador Fiscal y País son obligatorios." }), { status: 400 });
    }

    const statements = [];

    statements.push(
      db.prepare(`
        INSERT INTO clients (business_name, tax_id, email, phone, address, shipping_address, zip_code, observations, node_id) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(data.business_name, data.tax_id, data.email, data.phone, data.address, data.shipping_address, data.zip_code, data.observations, parseInt(data.node_id, 10))
    );

    if (data.userId) {
       const desc = `Dio de alta al cliente: ${data.business_name} (${data.tax_id})`;
       statements.push(db.prepare(`INSERT INTO audit_logs (user_id, action_type, description) VALUES (?, 'CLIENTE_NUEVO', ?)`).bind(data.userId, desc));
    }

    await db.batch(statements);
    return new Response(JSON.stringify({ status: "success", message: "Cliente registrado exitosamente." }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return new Response(JSON.stringify({ error: "Ya existe un cliente con ese Identificador Fiscal." }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: "Error de BD: " + error.message }), { status: 500 });
  }
}

// NUEVO: Función PUT para Editar Cliente
export async function onRequestPut(context) {
  try {
    const db = context.env.DB;
    const data = await context.request.json();

    if (!data.id || !data.business_name || !data.tax_id || !data.node_id) {
      return new Response(JSON.stringify({ error: "Faltan datos obligatorios para actualizar." }), { status: 400 });
    }

    const statements = [];

    statements.push(
      db.prepare(`
        UPDATE clients 
        SET business_name=?, tax_id=?, email=?, phone=?, address=?, shipping_address=?, zip_code=?, observations=?, node_id=?
        WHERE id=?
      `).bind(data.business_name, data.tax_id, data.email, data.phone, data.address, data.shipping_address, data.zip_code, data.observations, parseInt(data.node_id, 10), data.id)
    );

    if (data.userId) {
       const desc = `Actualizó datos del cliente: ${data.business_name}`;
       statements.push(db.prepare(`INSERT INTO audit_logs (user_id, action_type, description) VALUES (?, 'CLIENTE_EDIT', ?)`).bind(data.userId, desc));
    }

    await db.batch(statements);
    return new Response(JSON.stringify({ status: "success", message: "Datos actualizados exitosamente." }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Error de BD: " + error.message }), { status: 500 });
  }
}
