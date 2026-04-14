export async function onRequest(context) {
  const db = context.env.DB;
  
  if (context.request.method === "GET") {
    const { results } = await db.prepare("SELECT name FROM factories ORDER BY name").all();
    return new Response(JSON.stringify({ data: results }), { headers: {"Content-Type": "application/json"} });
  }
  
  if (context.request.method === "POST") {
    try {
      const { name } = await context.request.json();
      if (!name) return new Response("Nombre inválido", { status: 400 });
      await db.prepare("INSERT INTO factories (name) VALUES (?)").bind(name.trim()).run();
      return new Response(JSON.stringify({ success: true }));
    } catch(e) {
      return new Response(JSON.stringify({ error: "La fábrica ya existe o hubo un error."}), { status: 400 });
    }
  }
}
