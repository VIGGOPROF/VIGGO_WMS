export async function onRequest(context) {
  try {
    // context.env.DB es la conexión directa a tu base de datos viggo-wms-db
    const { results } = await context.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();

    return new Response(JSON.stringify({ 
      status: "success", 
      message: "API Viiggo conectada a la base de datos correctamente desde GitHub",
      tables: results 
    }), { 
      headers: { "Content-Type": "application/json" } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
