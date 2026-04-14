// ====================================================================
// MÓDULO 1: INGESTA DE EXCEL (Solo se ejecuta si existe el botón)
// ====================================================================
const uploadBtn = document.getElementById('upload-btn');

if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
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
}

// ====================================================================
// MÓDULO 2: DISTRIBUCIÓN Y FACTURACIÓN (Solo se ejecuta si existe el botón)
// ====================================================================
const dispatchBtn = document.getElementById('dispatch-btn');

if (dispatchBtn) {
    dispatchBtn.addEventListener('click', async () => {
        const origen = document.getElementById('origen-select').value;
        const destino = document.getElementById('destino-select').value;
        const transporte = document.getElementById('transporte-select').value;
        const sku = document.getElementById('transfer-sku').value;
        const qty = parseInt(document.getElementById('transfer-qty').value);
        const statusBox = document.getElementById('transfer-status');

        if (!sku || !qty || qty <= 0) {
            statusBox.innerText = '⚠️ Ingresa un SKU válido y una cantidad mayor a cero.';
            statusBox.style.color = 'red';
            return;
        }

        if (origen === destino) {
            statusBox.innerText = '⚠️ El origen y el destino no pueden ser el mismo nodo.';
            statusBox.style.color = 'red';
            return;
        }

        statusBox.innerText = '⏳ Procesando orden de despacho...';
        statusBox.style.color = 'black';

        try {
            const res = await fetch('/api/transfer', {
                method: 'POST',
                body: JSON.stringify({ origen, destino, transporte, sku, qty }),
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await res.json();

            if (res.ok) {
                statusBox.innerText = `✅ Éxito: ${result.message}\n` +
                                      `ETA (Llegada estimada): ${result.eta}\n` +
                                      `Total Facturado (Lista Destino): $${result.total_invoice}`;
                statusBox.style.color = 'green';
            } else {
                statusBox.innerText = `❌ Error: ${result.error}`;
                statusBox.style.color = 'red';
            }
        } catch (error) {
            statusBox.innerText = `❌ Error de conexión: ${error.message}`;
            statusBox.style.color = 'red';
        }
    });
}

// ====================================================================
// MÓDULO 3: DASHBOARD GLOBAL (Solo se ejecuta si existe el contenedor)
// ====================================================================
const dashboardContainer = document.getElementById('dashboard-container');
const refreshBtn = document.getElementById('refresh-dashboard');

if (dashboardContainer) {
    const loadDashboard = async () => {
        dashboardContainer.innerHTML = '<p>⏳ Consultando base de datos global...</p>';
        
        try {
            const res = await fetch('/api/dashboard');
            const result = await res.json();

            if (res.ok && result.data) {
                dashboardContainer.innerHTML = ''; // Limpiamos el contenedor
                
                // Recorremos cada país (nodo) que nos devolvió la API
                for (const [nodeName, nodeInfo] of Object.entries(result.data)) {
                    
                    let itemsHtml = '';
                    if (nodeInfo.items.length === 0) {
                        itemsHtml = '<p style="color: gray; font-style: italic;">Sin stock registrado</p>';
                    } else {
                        nodeInfo.items.forEach(item => {
                            // Mostrar tránsito solo si hay mercadería viajando
                            const transitBadge = item.transit > 0 
                                ? `<span class="stock-transit">(+${item.transit} en camino)</span>` 
                                : '';
                                
                            itemsHtml += `
                                <div class="stock-item">
                                    <span><strong>${item.sku}</strong> - ${item.name}</span>
                                    <span>Físico: <strong>${item.physical}</strong> ${transitBadge}</span>
                                </div>
                            `;
                        });
                    }

                    // Construir la tarjeta del País
                    const cardHtml = `
                        <div class="node-card">
                            <h3>🌎 ${nodeName} (${nodeInfo.code})</h3>
                            <div class="card-content">
                                ${itemsHtml}
                            </div>
                        </div>
                    `;
                    dashboardContainer.innerHTML += cardHtml;
                }
            } else {
                dashboardContainer.innerHTML = `<p style="color: red;">❌ Error: ${result.error}</p>`;
            }
        } catch (error) {
            dashboardContainer.innerHTML = `<p style="color: red;">❌ Error de red: ${error.message}</p>`;
        }
    };

    // Cargar al abrir la página
    loadDashboard();

    // Recargar al presionar el botón
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadDashboard);
    }
}

// ====================================================================
// MÓDULO 4: RECEPCIÓN DE MERCADERÍA (Solo se ejecuta si existe el botón)
// ====================================================================
const searchTransitBtn = document.getElementById('search-transit-btn');
const transitResults = document.getElementById('transit-results');

if (searchTransitBtn) {
    searchTransitBtn.addEventListener('click', async () => {
        const nodeId = document.getElementById('recv-node-select').value;
        transitResults.innerHTML = '<p>⏳ Buscando contenedores en tránsito...</p>';

        try {
            const res = await fetch(`/api/transit?node=${nodeId}`);
            const result = await res.json();

            if (res.ok && result.data) {
                if (result.data.length === 0) {
                    transitResults.innerHTML = '<p style="color: green;">✅ No hay mercadería en tránsito para este depósito.</p>';
                    return;
                }

                // Armar la tabla con los resultados
                let tableHtml = `
                    <table class="transit-table">
                        <thead>
                            <tr>
                                <th>SKU</th>
                                <th>Producto</th>
                                <th>Cantidad en Camino</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                result.data.forEach(item => {
                    tableHtml += `
                        <tr>
                            <td><strong>${item.sku}</strong></td>
                            <td>${item.name}</td>
                            <td style="color: #f39c12; font-weight: bold;">${item.in_transit}</td>
                            <td>
                                <button class="receive-btn" data-node="${nodeId}" data-product="${item.product_id}" data-qty="${item.in_transit}">
                                    📥 Recibir Stock
                                </button>
                            </td>
                        </tr>
                    `;
                });

                tableHtml += `</tbody></table><div id="recv-msg" style="margin-top:10px; font-weight:bold;"></div>`;
                transitResults.innerHTML = tableHtml;

                // Agregar el evento click a los nuevos botones "Recibir Stock"
                document.querySelectorAll('.receive-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const targetBtn = e.target;
                        const pId = targetBtn.getAttribute('data-product');
                        const nId = targetBtn.getAttribute('data-node');
                        const q = targetBtn.getAttribute('data-qty');
                        const msgBox = document.getElementById('recv-msg');

                        targetBtn.innerText = '⏳ Procesando...';
                        targetBtn.disabled = true;

                        try {
                            const rx = await fetch('/api/receive', {
                                method: 'POST',
                                body: JSON.stringify({ nodeId: nId, productId: pId, qty: q }),
                                headers: { 'Content-Type': 'application/json' }
                            });
                            const rxData = await rx.json();

                            if (rx.ok) {
                                msgBox.style.color = 'green';
                                msgBox.innerText = `✅ Éxito: ${rxData.message}`;
                                targetBtn.parentElement.parentElement.style.opacity = '0.3'; // Ocultar visualmente la fila procesada
                            } else {
                                msgBox.style.color = 'red';
                                msgBox.innerText = `❌ Error: ${rxData.error}`;
                                targetBtn.innerText = '📥 Recibir Stock';
                                targetBtn.disabled = false;
                            }
                        } catch (err) {
                            msgBox.innerText = `❌ Error: ${err.message}`;
                        }
                    });
                });

            } else {
                transitResults.innerHTML = `<p style="color: red;">❌ Error: ${result.error}</p>`;
            }
        } catch (error) {
            transitResults.innerHTML = `<p style="color: red;">❌ Error de conexión: ${error.message}</p>`;
        }
    });
}

// ====================================================================
// MÓDULO 5: SALIDA DE STOCK (Solo se ejecuta si existe el botón)
// ====================================================================
const outboundBtn = document.getElementById('outbound-btn');

if (outboundBtn) {
    outboundBtn.addEventListener('click', async () => {
        const nodeId = document.getElementById('outbound-node').value;
        const sku = document.getElementById('outbound-sku').value;
        const qty = parseInt(document.getElementById('outbound-qty').value);
        const ref = document.getElementById('outbound-ref').value;
        const statusBox = document.getElementById('outbound-status');

        if (!sku || !qty || qty <= 0) {
            statusBox.innerText = '⚠️ Ingresa un SKU válido y una cantidad mayor a cero.';
            statusBox.style.color = 'red';
            return;
        }

        statusBox.innerText = '⏳ Procesando salida de stock...';
        statusBox.style.color = 'black';
        outboundBtn.disabled = true;

        try {
            const res = await fetch('/api/outbound', {
                method: 'POST',
                // Enviamos los datos, incluyendo la referencia por si a futuro armamos un historial
                body: JSON.stringify({ nodeId, sku, qty, ref }),
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await res.json();

            if (res.ok) {
                statusBox.innerText = `✅ ${result.message}`;
                statusBox.style.color = 'green';
                // Limpiar campos
                document.getElementById('outbound-sku').value = '';
                document.getElementById('outbound-qty').value = '';
                document.getElementById('outbound-ref').value = '';
            } else {
                statusBox.innerText = `❌ Error: ${result.error}`;
                statusBox.style.color = 'red';
            }
        } catch (error) {
            statusBox.innerText = `❌ Error de conexión: ${error.message}`;
            statusBox.style.color = 'red';
        } finally {
            outboundBtn.disabled = false;
        }
    });
}

// ====================================================================
// MÓDULO 6: GESTOR DE PRECIOS (Solo se ejecuta si existe el botón)
// ====================================================================
const loadPricesBtn = document.getElementById('load-prices-btn');
const priceContainer = document.getElementById('price-list-container');
const savePricesBtn = document.getElementById('save-prices-btn');

if (loadPricesBtn) {
    loadPricesBtn.addEventListener('click', async () => {
        const nodeId = document.getElementById('price-node-select').value;
        priceContainer.innerHTML = '<p>⏳ Cargando catálogo y precios...</p>';
        document.getElementById('price-actions').style.display = 'none';

        try {
            const res = await fetch(`/api/prices?node=${nodeId}`);
            const result = await res.json();

            if (res.ok && result.data) {
                let html = `
                    <table class="price-table">
                        <thead><tr><th>SKU</th><th>Producto</th><th>Precio (USD)</th></tr></thead>
                        <tbody>
                `;
                result.data.forEach(item => {
                    html += `
                        <tr>
                            <td>${item.sku}</td>
                            <td>${item.name}</td>
                            <td><input type="number" step="0.01" class="price-input" 
                                       data-pid="${item.product_id}" value="${item.price}"></td>
                        </tr>
                    `;
                });
                html += '</tbody></table>';
                priceContainer.innerHTML = html;
                document.getElementById('price-actions').style.display = 'block';
            }
        } catch (err) { priceContainer.innerHTML = `<p style="color:red;">${err.message}</p>`; }
    });

    savePricesBtn.addEventListener('click', async () => {
        const nodeId = document.getElementById('price-node-select').value;
        const status = document.getElementById('save-status');
        const inputs = document.querySelectorAll('.price-input');
        
        const prices = Array.from(inputs).map(input => ({
            productId: input.getAttribute('data-pid'),
            price: input.value
        }));

        status.innerText = '⏳ Guardando...';
        status.style.color = 'black';

        try {
            const res = await fetch('/api/prices', {
                method: 'POST',
                body: JSON.stringify({ nodeId, prices }),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                status.innerText = '✅ Precios actualizados correctamente.';
                status.style.color = 'green';
            }
        } catch (err) { status.innerText = '❌ Error al guardar.'; status.style.color = 'red'; }
    });
}
