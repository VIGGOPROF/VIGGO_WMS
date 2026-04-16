// 1. OBTENER DEPÓSITOS (GET)
export async function onRequestGet(context) {
  try {
    const { results } = await context.env.DB.prepare("SELECT * FROM nodes ORDER BY display_order ASC").all();
    return new Response(JSON.stringify({ status: "success", data: results }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Error GET: " + error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

// 2. CREAR DEPÓSITO (POST)
export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const name = String(body.name || "").trim();
    const order = parseInt(body.display_order || body.order || 999);

    if (!name) {
      return new Response(JSON.stringify({ error: "El nombre es obligatorio." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    await context.env.DB.prepare("INSERT INTO nodes (name, display_order) VALUES (?, ?)").bind(name, order).run();
    return new Response(JSON.stringify({ status: "success" }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Error POST: " + error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

// 3. ACTUALIZAR DEPÓSITO (PUT)
export async function onRequestPut(context) {
  try {
    const body = await context.request.json();
    const id = body.id;
    const name = String(body.name || "").trim();
    const order = parseInt(body.display_order || body.order || 999);

    if (!id || !name) {
      return new Response(JSON.stringify({ error: "Faltan datos." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    await context.env.DB.prepare("UPDATE nodes SET name = ?, display_order = ? WHERE id = ?").bind(name, order, id).run();
    return new Response(JSON.stringify({ status: "success" }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Error PUT: " + error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

// 4. ELIMINAR DEPÓSITO (DELETE)
export async function onRequestDelete(context) {
  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return new Response(JSON.stringify({ error: "Falta ID." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    // Verificar si hay stock antes de borrar
    const checkStock = await context.env.DB.prepare("SELECT SUM(physical_stock + transit_stock) as qty FROM inventory WHERE node_id = ?").bind(id).first();
    
    if (checkStock && checkStock.qty > 0) {
      return new Response(JSON.stringify({ error: "Tiene stock adentro. Vacíalo primero." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    await context.env.DB.prepare("DELETE FROM nodes WHERE id = ?").bind(id).run();
    return new Response(JSON.stringify({ status: "success" }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    if (error.message.includes('FOREIGN KEY')) {
      return new Response(JSON.stringify({ error: "Hay clientes atados a este depósito." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "Error DELETE: " + error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
