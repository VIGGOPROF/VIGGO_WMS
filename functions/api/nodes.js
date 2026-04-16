export async function onRequest(context) {
  const db = context.env.DB;
  const method = context.request.method;
  const url = new URL(context.request.url);

  // El try...catch es nuestro escudo. Si algo falla, no rompe la página, devuelve el error exacto.
  try {
    if (method === "GET") {
      const { results } = await db.prepare("SELECT id, name, display_order FROM nodes ORDER BY display_order ASC").all();
      return new Response(JSON.stringify({ status: "success", data: results }), { headers: {"Content-Type": "application/json"} });
    }
    
    if (method === "POST") {
      const body = await context.request.json();
      
      // Sanitizamos los datos para evitar que el servidor explote si llegan nulos o en formato texto
      const name = String(body.name || "").trim();
      const order = parseInt(body.order || body.display_order || body.priority) || 0; 

      if (!name) {
         return new Response(JSON.stringify({ error: "El nombre del depósito es obligatorio." }), { status: 400, headers: {"Content-Type": "application/json"} });
      }

      await db.prepare("INSERT INTO nodes (name, display_order) VALUES (?, ?)").bind(name, order).run();
      return new Response(JSON.stringify({ status: "success", message: "Depósito agregado correctamente." }), { headers: {"Content-Type": "application/json"} });
    }

    if (method === "PUT") {
      const body = await context.request.json();
      const id = body.id;
      
      const name = String(body.name || "").trim();
      const order = parseInt(body.order || body.display_order || body.priority) || 0;

      if (!id || !name) {
         return new Response(JSON.stringify({ error: "Faltan datos para actualizar." }), { status: 400, headers: {"Content-Type": "application/json"} });
      }

      await db.prepare("UPDATE nodes SET name = ?, display_order = ? WHERE id = ?").bind(name, order, id).run();
      return new Response(JSON.stringify({ status: "success", message: "Depósito actualizado." }), { headers: {"Content-Type": "application/json"} });
    }

    if (method === "DELETE") {
      const id = url.searchParams.get('id');
      
      if (!id) {
          return new Response(JSON.stringify({ error: "Falta el ID del depósito." }), { status: 400, headers: {"Content-Type": "application/json"} });
      }

      // FIX CRÍTICO: Las columnas correctas son physical_stock y transit_stock
      const checkStock = await db.prepare("SELECT SUM(physical_stock + transit_stock) as qty FROM inventory WHERE node_id = ?").bind(id).first();
      
      if (checkStock && checkStock.qty > 0) {
        return new Response(JSON.stringify({ error: "No puedes borrar un depósito que tiene stock adentro. Primero vacíalo." }), { status: 400, headers: {"Content-Type": "application/json"} });
      }

      await db.prepare("DELETE FROM nodes WHERE id = ?").bind(id).run();
      return new Response(JSON.stringify({ status: "success", message: "Depósito eliminado." }), { headers: {"Content-Type": "application/json"} });
    }

    // Si entra un método raro que no sea GET, POST, PUT o DELETE
    return new Response(JSON.stringify({ error: "Método no soportado." }), { status: 405, headers: {"Content-Type": "application/json"} });

  } catch (error) {
    // Si la base de datos se queja (ej. clientes atados al depósito), lo atrapamos aquí
    if (error.message.includes('FOREIGN KEY constraint failed')) {
        return new Response(JSON.stringify({ error: "No se puede borrar. Hay clientes o listas de precios asociados a este depósito." }), { status: 400, headers: {"Content-Type": "application/json"} });
    }
    // Devolvemos el error EXACTO para saber por qué falla si llega a ocurrir otro problema
    return new Response(JSON.stringify({ error: "Error de BD: " + error.message }), { status: 500, headers: {"Content-Type": "application/json"} });
  }
}
