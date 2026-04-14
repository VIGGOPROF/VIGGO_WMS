document.getElementById('upload-btn').addEventListener('click', async () => {
    const fileInput = document.getElementById('excel-file');
    const statusBox = document.getElementById('status-box');

    if (!fileInput.files.length) {
        statusBox.innerText = '⚠️ Por favor, selecciona un archivo Excel primero.';
        statusBox.style.color = 'red';
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        statusBox.innerText = '⏳ Leyendo Excel...';
        statusBox.style.color = 'black';

        // Procesar el Excel a JSON
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);

        if (jsonData.length === 0) {
            statusBox.innerText = '⚠️ El Excel está vacío.';
            return;
        }

        statusBox.innerText = `🚀 Enviando ${jsonData.length} productos a la base de datos...`;

        try {
            // Enviar datos a tu API en Cloudflare
            const res = await fetch('/api/ingest', {
                method: 'POST',
                body: JSON.stringify(jsonData),
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await res.json();

            if (res.ok) {
                statusBox.innerText = `✅ Éxito: ${result.message}`;
                statusBox.style.color = 'green';
                fileInput.value = ''; // Limpiar el input
            } else {
                statusBox.innerText = `❌ Error del servidor: ${result.error}`;
                statusBox.style.color = 'red';
            }
        } catch (error) {
            statusBox.innerText = `❌ Error de conexión: ${error.message}`;
            statusBox.style.color = 'red';
        }
    };

    reader.readAsArrayBuffer(file);
});
