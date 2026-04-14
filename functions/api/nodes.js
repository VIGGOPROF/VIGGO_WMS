export async function onRequest(context) {
  const db = context.env.DB;
  const method = context.request.method;
  const url = new URL(context.request.url);

  if (method === "GET") {
    const { results } = await db.prepare("SELECT id, name, display_order FROM nodes ORDER BY display_order ASC").all();
    return new Response(JSON.stringify({ data: results }), { headers: {"Content-Type": "application/json"} });
  }
  
  if (method === "POST") {
    const { name, order } = await context.request.json();
    await db.prepare("INSERT INTO nodes (name, display_order) VALUES (?, ?)").bind(name, order || 999).run();
    return new Response(JSON.stringify({ success: true }));
  }

  if (method === "PUT") {
    const { id, name, order } = await context.request.json();
    await db.prepare("UPDATE nodes SET name = ?, display_order = ? WHERE id = ?").bind(name, order, id).run();
    return new Response(JSON.stringify({ success: true }));
  }

  if (method === "DELETE") {
    const id = url.searchParams.get('id');
    // Nota: Solo borrará si no hay inventario asociado (integridad referencial)
    await db.prepare("DELETE FROM nodes WHERE id = ?").bind(id).run();
    return new Response(JSON.stringify({ success: true }));
  }
}
