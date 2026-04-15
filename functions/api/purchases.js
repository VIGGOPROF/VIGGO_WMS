export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
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
        i.expected_eta
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
    const { items } = await context.request.json();

    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ error: "No hay datos para cargar." }), { status: 400 });
    }

    const statements = [];
    const processedOCs = new Set();

    for (const row of items) {
      // 1. Cabecera de OC
      if (!processedOCs.has(row.OC)) {
        statements.push(
          db.prepare(`INSERT OR IGNORE INTO purchase_orders (oc_number, provider, order_date) VALUES (?, ?, ?)`).bind(row.OC, row.Proveedor, row.Fecha_OC)
        );
        processedOCs.add(row.OC);
      }

      // 2. Normalizar fecha y calcular ETA
      let orderDateObj;
      if (row.Fecha_OC.includes('/')) {
         orderDateObj = new Date(row.Fecha_OC.split('/').reverse().join('-')); 
      } else {
         orderDateObj = new Date(row.Fecha_OC); // Para el input manual (YYYY-MM-DD)
      }
      orderDateObj.setDate(orderDateObj.getDate() + parseInt(row.Dias_Fab, 10));
      const expectedEta = orderDateObj.toISOString().split('T')[0];

      // 3. Buscar nombre del producto desde el Catálogo usando el SKU
      const prod = await db.prepare('SELECT name FROM products WHERE sku = ?').bind(row.SKU.trim()).first();
      
      if (!prod) {
         return new Response(JSON.stringify({ error: `El SKU "${row.SKU}" no existe en el catálogo. Créalo primero.` }), { status: 400 });
      }

      // 4. Insertar Detalle
      statements.push(
        db.prepare(`
          INSERT INTO purchase_order_items (oc_number, sku, product_name, qty_ordered, factory_days, expected_eta) 
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(row.OC, row.SKU, prod.name, parseInt(row.Cantidad, 10), parseInt(row.Dias_Fab, 10), expectedEta)
      );
    }

    await db.batch(statements);

    return new Response(JSON.stringify({ status: "success", message: `Ingreso procesado correctamente (${items.length} línea/s).` }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Error de BD: " + error.message }), { status: 500 });
  }
}
