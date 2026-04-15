export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    
    // Traemos los clientes, el nombre de su depósito/país, y calculamos su saldo actual
    const query = `
      SELECT 
        c.id, 
        c.business_name, 
        c.tax_id, 
        c.email, 
        c.phone, 
        c.address,
        c.node_id,
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
    const { business_name, tax_id, email, phone, address, node_id, userId } = await context.request.json();

    if (!business_name || !tax_id || !node_id) {
      return new Response(JSON.stringify({ error: "Razón Social, Identificador Fiscal (RUT/CUIT) y País son obligatorios." }), { status: 400 });
    }

    const statements = [];

    // 1. Insertar el cliente
    statements.push(
      db.prepare(`
        INSERT INTO clients (business_name, tax_id, email, phone, address, node_id) 
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(business_name, tax_id, email, phone, address, parseInt(node_id, 10))
    );

    // 2. Registro de Auditoría
    if (userId) {
       const desc = `Dio de alta al cliente/distribuidor: ${business_name} (${tax_id})`;
       statements.push(
           db.prepare(`INSERT INTO audit_logs (user_id, action_type, description) VALUES (?, 'CLIENTE_NUEVO', ?)`)
             .bind(userId, desc)
       );
    }

    await db.batch(statements);

    return new Response(JSON.stringify({ status: "success", message: "Cliente registrado exitosamente." }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    // Manejo del error si el tax_id (CUIT/RUT) ya existe
    if (error.message.includes('UNIQUE constraint failed')) {
      return new Response(JSON.stringify({ error: "Ya existe un cliente con ese Identificador Fiscal." }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: "Error de BD: " + error.message }), { status: 500 });
  }
}
