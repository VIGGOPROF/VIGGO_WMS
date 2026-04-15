export async function onRequest(context) {
  const db = context.env.DB;
  const method = context.request.method;
  const url = new URL(context.request.url);

  // El try...catch es nuestro escudo. Si algo falla, no rompe la página, devuelve un texto.
  try {
    if (method === "GET") {
      const { results } = await db.prepare("SELECT id, name, display_order FROM nodes ORDER BY display_order ASC").all();
      // Aseguramos devolver status: "success" para que el frontend lo entienda
      return new Response(JSON.stringify({ status: "success", data: results }), { headers: {"Content-Type": "application/json"} });
    }
    
    if (method === "POST") {
      const body = await context.request.json();
      const name = body.name;
      // Atrapamos "order" o "priority" por si tu frontend manda cualquiera de los dos
      const order = body.order || body.priority || 999; 

      if (!name) {
         return new Response(JSON.stringify({ error: "El nombre del depósito es obligatorio." }), { status: 400, headers: {"Content-Type": "application/json"} });
      }

      await db.prepare("INSERT INTO nodes (name, display_order) VALUES (?, ?)").bind(name.trim(), order).run();
      return new Response(JSON.stringify({ status: "success", message: "Depósito agregado correctamente." }), { headers: {"Content-Type": "application/json"} });
    }

    if (method === "PUT") {
      const body = await context.request.json();
      const id = body.id;
      const name = body.name;
      const order = body.order || body.priority || 999;

      if (!id || !name) {
         return new Response(JSON.stringify({ error: "Faltan datos para actualizar." }), { status: 400, headers: {"Content-Type": "application/json"} });
      }

      await db.prepare("UPDATE nodes SET name = ?, display_order = ? WHERE id = ?").bind(name.trim(), order, id).run();
      return new Response(JSON.stringify({ status: "success", message: "Depósito actualizado." }), { headers: {"Content-Type": "application/json"} });
    }

    if (method === "DELETE") {
      const id = url.searchParams.get('id');
      
      if (!id) {
          return new Response(JSON.stringify({ error: "Falta el ID del depósito." }), { status: 400, headers: {"Content-Type": "application/json"} });
      }

      // Validar que no tenga stock antes de borrar (Protección de inventario)
      const checkStock = await db.prepare("SELECT SUM(quantity) as qty FROM inventory WHERE node_id = ?").bind(id).first();
      
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
    return new Response(JSON.stringify({ error: "Error de BD: " + error.message }), { status: 500, headers: {"Content-Type": "application/json"} });
  }
}
