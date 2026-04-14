export async function onRequest(context) {
  const db = context.env.DB;
  const method = context.request.method;
  const url = new URL(context.request.url);

  if (method === "GET") {
    const { results } = await db.prepare("SELECT id, name FROM factories ORDER BY name").all();
    return new Response(JSON.stringify({ data: results }), { headers: {"Content-Type": "application/json"} });
  }
  
  if (method === "POST") {
    try {
      const { name } = await context.request.json();
      await db.prepare("INSERT INTO factories (name) VALUES (?)").bind(name.trim()).run();
      return new Response(JSON.stringify({ success: true }));
    } catch(e) { return new Response(JSON.stringify({ error: "Error o duplicado"}), { status: 400 }); }
  }

  if (method === "PUT") {
    try {
      const { id, name } = await context.request.json();
      await db.prepare("UPDATE factories SET name = ? WHERE id = ?").bind(name.trim(), id).run();
      return new Response(JSON.stringify({ success: true }));
    } catch(e) { return new Response(JSON.stringify({ error: "Error al actualizar"}), { status: 400 }); }
  }

  if (method === "DELETE") {
    try {
      const id = url.searchParams.get('id');
      await db.prepare("DELETE FROM factories WHERE id = ?").bind(id).run();
      return new Response(JSON.stringify({ success: true }));
    } catch(e) { return new Response(JSON.stringify({ error: "No se puede borrar si está en uso"}), { status: 400 }); }
  }
}
