export async function onRequestPost(context) {
  try {
    const data = await context.request.json();
    const db = context.env.DB;

    const nodeId = parseInt(data.nodeId);
    const productId = parseInt(data.productId);
    const qtyToReceive = parseInt(data.qty);

    // Mueve la cantidad de "reserved" a "quantity" (físico)
    const statement = db.prepare(`
      UPDATE inventory 
      SET quantity = quantity + ?, 
          reserved_quantity = reserved_quantity - ?,
          last_updated = CURRENT_TIMESTAMP
      WHERE node_id = ? AND product_id = ?
    `).bind(qtyToReceive, qtyToReceive, nodeId, productId);

    await statement.run();

    return new Response(JSON.stringify({ 
        status: "success", 
        message: "Mercadería ingresada al stock físico correctamente." 
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
