export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const sku = url.searchParams.get('sku');
    const db = context.env.DB;
    
    if (!sku) return new Response("SKU requerido", { status: 400 });

    const product = await db.prepare("SELECT name, category, factory_name FROM products WHERE sku = ?").bind(sku).first();
    
    return new Response(JSON.stringify({ data: product || null }), { headers: {"Content-Type": "application/json"} });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
