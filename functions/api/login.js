// functions/api/login.js
export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const { username, password } = await context.request.json();

    if (!username || !password) {
      return new Response(JSON.stringify({ error: "Por favor, ingresa usuario y contraseña." }), { status: 400 });
    }

    // Buscamos al usuario en la base de datos
    const user = await db.prepare('SELECT id, username, full_name, role FROM users WHERE username = ? AND password = ?')
                         .bind(username.trim(), password)
                         .first();

    if (!user) {
      return new Response(JSON.stringify({ error: "Usuario o contraseña incorrectos." }), { status: 401 });
    }

    // Generamos un "Token" súper básico (En un sistema enterprise real se usa JWT)
    // Aquí usamos un string codificado en base64 para que el navegador lo guarde
    const tokenPayload = { id: user.id, username: user.username, name: user.full_name, role: user.role, time: Date.now() };
    const fakeToken = btoa(JSON.stringify(tokenPayload));

    return new Response(JSON.stringify({ 
      status: "success", 
      message: "Acceso autorizado", 
      token: fakeToken,
      user: { name: user.full_name, role: user.role }
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Error del servidor: " + error.message }), { status: 500 });
  }
}
