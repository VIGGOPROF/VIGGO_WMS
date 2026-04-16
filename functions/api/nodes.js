export async function onRequest(context) {
  const db = context.env.DB;
  const method = context.request.method;
  const url = new URL(context.request.url);

  try {
    if (method === "GET") {
      const { results } = await db.prepare("SELECT * FROM nodes ORDER BY display_order ASC").all();
      return new Response(JSON.stringify({ status: "success", data: results }), { headers: {"Content-Type": "application/json"} });
    }

    if (method === "PUT") {
      const body = await context.request.json();
      const id = body.id;
      const name = String(body.name || "").trim();
      const order = parseInt(body.order || body.display_order || body.priority) || 99;
      // Atrapamos el país, si viene vacío le ponemos AR por defecto
      const countryCode = String(body.country_code || "AR").trim().substring(0, 2).toUpperCase();

      if (!id || !name) {
         return new Response(JSON.stringify({ error: "Faltan datos para actualizar." }), { status: 400, headers: {"Content-Type": "application/json"} });
      }

      await db.prepare("UPDATE nodes SET name = ?, display_order = ?, country_code = ? WHERE id = ?").bind(name, order, countryCode, id).run();
      return new Response(JSON.stringify({ status: "success", message: "Depósito actualizado." }), { headers: {"Content-Type": "application/json"} });
    }

    if (method === "DELETE") {
      const id = url.searchParams.get('id');
      if (!id) return new Response(JSON.stringify({ error: "Falta el ID." }), { status: 400, headers: {"Content-Type": "application/json"} });

      const checkStock = await db.prepare("SELECT SUM(physical_stock + transit_stock) as qty FROM inventory WHERE node_id = ?").bind(id).first();
      if (checkStock && checkStock.qty > 0) {
        return new Response(JSON.stringify({ error: "No puedes borrar un depósito que tiene stock adentro. Primero vacíalo." }), { status: 400, headers: {"Content-Type": "application/json"} });
      }

      await db.prepare("DELETE FROM nodes WHERE id = ?").bind(id).run();
      return new Response(JSON.stringify({ status: "success" }), { headers: {"Content-Type": "application/json"} });
    }

    if (method === "POST") {
      const body = await context.request.json();
      const name = String(body.name || "").trim();
      const order = parseInt(body.order || body.display_order || body.priority) || 99;
      // Atrapamos el país en la creación
      const countryCode = String(body.country_code || "AR").trim().substring(0, 2).toUpperCase();
      
      if (!name) return new Response(JSON.stringify({ error: "El nombre es obligatorio." }), { status: 400, headers: {"Content-Type": "application/json"} });

      await db.prepare("INSERT INTO nodes (name, display_order, country_code) VALUES (?, ?, ?)").bind(name, order, countryCode).run();
      return new Response(JSON.stringify({ status: "success" }), { headers: {"Content-Type": "application/json"} });
    }

    return new Response(JSON.stringify({ error: "Método no soportado." }), { status: 405 });

  } catch (error) {
    if (error.message.includes('FOREIGN KEY')) {
        return new Response(JSON.stringify({ error: "No se puede borrar. Hay datos asociados a este depósito." }), { status: 400, headers: {"Content-Type": "application/json"} });
    }
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: {"Content-Type": "application/json"} });
  }
}
