export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const docRef = url.searchParams.get('doc');

    if (!docRef) {
        return new Response(JSON.stringify({ error: "Falta el documento de referencia" }), { status: 400 });
    }

    try {
        // Buscamos los ítems cruzando la tabla de detalles con la tabla de ventas
        const finalQuery = `
            SELECT 
                si.sku, 
                si.product_name as name, 
                si.quantity, 
                si.unit_price, 
                (si.quantity * si.unit_price) as subtotal
            FROM sale_items si
            JOIN sales s ON si.sale_id = s.id
            WHERE s.reference_doc = ?
        `;

        const { results } = await env.DB.prepare(finalQuery).bind(docRef).all();

        return new Response(JSON.stringify({ success: true, items: results }), { headers: { "Content-Type": "application/json" } });
    } catch (error) {
        return new Response(JSON.stringify({ success: false, items: [], error: error.message }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
}
