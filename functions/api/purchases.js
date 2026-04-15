export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    
    // Consulta que trae todo el detalle de las órdenes con su saldo pendiente
    const query = `
      SELECT 
        o.oc_number, 
        o.provider, 
        o.order_date, 
        o.status,
        i.sku, 
        i.product_name, 
        i.qty_ordered, 
        i.qty_received, 
        (i.qty_ordered - i.qty_received) as pending_qty,
        i.expected_eta,
        i.sales_goal
      FROM purchase_orders o
      JOIN purchase_order_items i ON o.oc_number = i.oc_number
      ORDER BY o.created_at DESC, i.sku ASC
    `;

    const { results } = await db.prepare(query).all();
    return new Response(JSON.stringify({ status: "success", data: results }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const { items } = await context.request.json(); // Recibe el array del Excel

    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ error: "El Excel está vacío." }), { status: 400 });
    }

    const statements = [];
    const processedOCs = new Set();

    for (const row of items) {
      // 1. Crear la cabecera de la OC (IGNORAR si ya existe por si el Excel tiene varias filas de la misma OC)
      if (!processedOCs.has(row.OC)) {
        statements.push(
          db.prepare(`INSERT OR IGNORE INTO purchase_orders (oc_number, provider, order_date) VALUES (?, ?, ?)`).bind(row.OC, row.Proveedor, row.Fecha_OC)
        );
        processedOCs.add(row.OC);
      }

      // 2. Calcular ETA sumando los días de fábrica a la fecha de la orden
      const orderDateObj = new Date(row.Fecha_OC.split('/').reverse().join('-')); // Asume formato DD/MM/YYYY
      orderDateObj.setDate(orderDateObj.getDate() + parseInt(row.Dias_Fab, 10));
      const expectedEta = orderDateObj.toISOString().split('T')[0]; // Formato YYYY-MM-DD

      // 3. Insertar el detalle del producto
      statements.push(
        db.prepare(`
          INSERT INTO purchase_order_items (oc_number, sku, product_name, qty_ordered, factory_days, expected_eta, sales_goal) 
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(row.OC, row.SKU, row.Articulo, parseInt(row.Cantidad, 10), parseInt(row.Dias_Fab, 10), expectedEta, row.Proy_Venta || '')
      );
    }

    await db.batch(statements);

    return new Response(JSON.stringify({ status: "success", message: `Orden/es generada/s exitosamente con ${items.length} líneas de producto.` }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Error de BD: " + error.message }), { status: 500 });
  }
}
