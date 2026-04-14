// ====================================================================
// API: GESTOR DE PRECIOS (functions/api/prices.js)
// ====================================================================

// 1. CONSULTAR PRECIOS (GET)
export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    const url = new URL(context.request.url);
    const nodeId = url.searchParams.get('nodeId') || url.searchParams.get('node');

    if (!nodeId) {
      return new Response(JSON.stringify({ error: "Debe especificar un nodeId para consultar los precios." }), { status: 400 });
    }

    // Traemos todos los productos y cruzamos con la tabla de precios para ese nodo específico
    const query = `
      SELECT 
        p.id as product_id,
        p.sku,
        p.name,
        COALESCE(pr.price, 0) as price
      FROM products p
      LEFT JOIN prices pr ON p.id = pr.product_id AND pr.node_id = ?
      ORDER BY p.display_order ASC, p.sku ASC
    `;

    const { results } = await db.prepare(query).bind(nodeId).all();

    return new Response(JSON.stringify({ status: "success", data: results }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

// 2. ACTUALIZAR PRECIOS (POST)
export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const { nodeId, prices } = await context.request.json();

    if (!nodeId) {
      return new Response(JSON.stringify({ error: "Falta seleccionar el país/depósito de destino." }), { status: 400 });
    }

    if (!prices || !Array.isArray(prices)) {
      return new Response(JSON.stringify({ error: "No se enviaron precios válidos para procesar." }), { status: 400 });
    }

    const statements = [];

    // Procesamos cada item enviado (sea desde edición manual o Excel)
    for (const item of prices) {
      let productId = item.productId;

      // TRADUCTOR: Si el productId está vacío (carga de Excel), lo buscamos por SKU
      if (!productId && item.sku) {
        const prod = await db.prepare('SELECT id FROM products WHERE sku = ?').bind(item.sku).first();
        
        if (!prod) {
          // Si el SKU no existe en el catálogo, lanzamos error específico
          return new Response(JSON.stringify({ 
            error: `El SKU "${item.sku}" no existe en el sistema. Debe crearlo en el Catálogo antes de asignarle un precio.` 
          }), { status: 400 });
        }
        productId = prod.id;
      }

      // Preparamos la sentencia SQL: Insertar o Actualizar si ya existe (UPSERT)
      if (productId) {
        statements.push(
          db.prepare(`
            INSERT INTO prices (node_id, product_id, price) 
            VALUES (?, ?, ?)
            ON CONFLICT(node_id, product_id) DO UPDATE SET price = excluded.price
          `).bind(nodeId, productId, item.price)
        );
      }
    }

    // Ejecutamos todos los cambios en un solo bloque (Batch) para máxima velocidad
    if (statements.length > 0) {
      await db.batch(statements);
    }

    return new Response(JSON.stringify({ 
      status: "success", 
      message: `Se han actualizado ${statements.length} precios en la lista de destino.` 
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    // Si ocurre un error de base de datos (como el de Foreign Key), lo capturamos aquí
    return new Response(JSON.stringify({ error: "Error de base de datos: " + error.message }), { status: 500 });
  }
}
