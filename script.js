// ====================================================================
// MÓDULO 1: INGRESO HÍBRIDO (Manual + Excel)
// ====================================================================
const btnManual = document.getElementById('btn-submit-manual');
const btnExcel = document.getElementById('btn-submit-excel');
const inboundStatus = document.getElementById('inbound-status');

// Función centralizada para enviar al backend
async function sendInboundData(nodeId, itemsArray, btnElement) {
    btnElement.disabled = true;
    const originalText = btnElement.innerText;
    btnElement.innerText = '⏳ Procesando...';
    inboundStatus.innerHTML = '<span style="color:black;">Comunicando con la base de datos...</span>';

    try {
        const res = await fetch('/api/inbound', {
            method: 'POST',
            body: JSON.stringify({ nodeId: nodeId, items: itemsArray }),
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await res.json();

        if (res.ok) {
            inboundStatus.innerHTML = `✅ <span style="color:green;">${result.message}</span>`;
            return true; // Éxito
        } else {
            inboundStatus.innerHTML = `❌ <span style="color:red;">Error: ${result.error}</span>`;
            return false;
        }
    } catch (error) {
        inboundStatus.innerHTML = `❌ <span style="color:red;">Falla de red: ${error.message}</span>`;
        return false;
    } finally {
        btnElement.disabled = false;
        btnElement.innerText = originalText;
    }
}

// Evento: Carga Manual
if (btnManual) {
    btnManual.addEventListener('click', async () => {
        const nodeId = document.getElementById('inbound-node').value;
        const sku = document.getElementById('man-sku').value;
        const name = document.getElementById('man-name').value;
        const cat = document.getElementById('man-cat').value;
        const fab = document.getElementById('man-fab').value;
        const qty = document.getElementById('man-qty').value;

        if (!sku || !qty) {
            inboundStatus.innerHTML = '⚠️ <span style="color:red;">El SKU y la Cantidad son obligatorios.</span>';
            return;
        }

        const items = [{ sku: sku, name: name, category: cat, factory: fab, qty: qty }];
        
        const success = await sendInboundData(nodeId, items, btnManual);
        if (success) {
            // Limpiar formulario si fue exitoso
            document.getElementById('man-sku').value = '';
            document.getElementById('man-qty').value = '';
        }
    });
}

// Evento: Carga Excel
if (btnExcel) {
    btnExcel.addEventListener('click', async () => {
        const nodeId = document.getElementById('inbound-node').value;
        const fileInput = document.getElementById('excel-file');

        if (!fileInput.files.length) {
            inboundStatus.innerHTML = '⚠️ <span style="color:red;">Selecciona un archivo Excel primero.</span>';
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            if (jsonData.length === 0) {
                inboundStatus.innerHTML = '⚠️ <span style="color:red;">El Excel parece estar vacío.</span>';
                return;
            }

            const success = await sendInboundData(nodeId, jsonData, btnExcel);
            if (success) {
                // Resetear el visual de subida
                document.getElementById('drop-zone').style.display = 'block';
                document.getElementById('file-info').style.display = 'none';
                fileInput.value = '';
            }
        };
        reader.readAsArrayBuffer(fileInput.files[0]);
    });
}

// ====================================================================
// MÓDULO 2: DISTRIBUCIÓN Y FACTURACIÓN (Por Lote Excel)
// ====================================================================
const dispatchBtn = document.getElementById('dispatch-btn');

if (dispatchBtn) {
    dispatchBtn.addEventListener('click', async () => {
        const origen = document.getElementById('origen-select').value;
        const destino = document.getElementById('destino-select').value;
        const transporte = document.getElementById('transporte-select').value;
        const fileInput = document.getElementById('dist-excel-file');
        const statusBox = document.getElementById('transfer-status');

        if (origen === destino) {
            statusBox.innerHTML = '⚠️ <span style="color:red;">El origen y destino no pueden ser iguales.</span>';
            return;
        }

        if (!fileInput.files.length) {
            statusBox.innerHTML = '⚠️ <span style="color:red;">Por favor, sube el Excel (Packing List) primero.</span>';
            return;
        }

        const file = fileInput.files[0];
        const reader = new FileReader();

        reader.onload = async (e) => {
            statusBox.innerHTML = '⏳ <span style="color:black;">Leyendo Excel...</span>';
            dispatchBtn.disabled = true;

            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);

                if (jsonData.length === 0) {
                    statusBox.innerHTML = '⚠️ <span style="color:red;">El Excel está vacío.</span>';
                    dispatchBtn.disabled = false;
                    return;
                }

                statusBox.innerHTML = `🚀 <span style="color:black;">Validando stock de ${jsonData.length} líneas...</span>`;

                const res = await fetch('/api/transfer', {
                    method: 'POST',
                    body: JSON.stringify({ origen, destino, transporte, items: jsonData }),
                    headers: { 'Content-Type': 'application/json' }
                });

                const result = await res.json();

                if (res.ok) {
                    statusBox.innerHTML = `<span style="color:green;">✅ ${result.message} ETA: ${result.eta} | Factura: $${result.total_invoice.toFixed(2)}</span>`;
                    // Resetear el formulario visual
                    document.getElementById('dist-drop-zone').style.display = 'block';
                    document.getElementById('dist-file-info').style.display = 'none';
                    fileInput.value = '';
                } else {
                    statusBox.innerHTML = `❌ <span style="color:red;">${result.error}</span>`;
                }
            } catch (error) {
                statusBox.innerHTML = `❌ <span style="color:red;">Error de conexión: ${error.message}</span>`;
            } finally {
                dispatchBtn.disabled = false;
            }
        };

        reader.readAsArrayBuffer(file);
    });
}

// ====================================================================
// MÓDULO 3: DASHBOARD GLOBAL (Grilla, Filtros y Excel)
// ====================================================================
const dashboardContainer = document.getElementById('dashboard-container');
const refreshBtn = document.getElementById('refresh-dashboard');
const searchInput = document.getElementById('dashboard-search');
const transitCheckbox = document.getElementById('filter-transit');
const exportBtn = document.getElementById('export-dashboard-btn');

if (dashboardContainer) {
    const loadDashboard = async () => {
        dashboardContainer.innerHTML = '<p>⏳ Consultando matriz global...</p>';
        
        try {
            const res = await fetch('/api/dashboard');
            const result = await res.json();

            if (res.ok && result.data) {
                const nodes = Object.keys(result.data);
                const productMap = new Map();

                for (const [nodeName, nodeInfo] of Object.entries(result.data)) {
                    nodeInfo.items.forEach(item => {
                        if (!productMap.has(item.sku)) {
                            const defaultStock = {};
                            nodes.forEach(n => defaultStock[n] = { phys: 0, trans: 0 });
                            productMap.set(item.sku, { name: item.name, stock: defaultStock });
                        }
                        productMap.get(item.sku).stock[nodeName] = { 
                            phys: item.physical || 0, 
                            trans: item.transit || 0 
                        };
                    });
                }

                if (productMap.size === 0) {
                    dashboardContainer.innerHTML = '<p style="color: gray;">Sin stock registrado en el sistema.</p>';
                    return;
                }

                let html = '<table class="excel-table"><thead><tr>';
                html += '<th>SKU</th><th>Producto</th>';
                nodes.forEach(n => html += `<th>${n}</th>`);
                html += '</tr></thead><tbody>';

                productMap.forEach((data, sku) => {
                    html += `<tr>
                                <td><strong>${sku}</strong></td>
                                <td>${data.name}</td>`;
                    
                    nodes.forEach(n => {
                        const stock = data.stock[n];
                        const transHtml = stock.trans > 0 ? `<span class="transit-badge">✈️ +${stock.trans}</span>` : '';
                        html += `<td>${stock.phys} ${transHtml}</td>`;
                    });
                    html += '</tr>';
                });

                html += '</tbody></table>';
                dashboardContainer.innerHTML = html;

                // Re-aplicar filtros inmediatamente después de cargar por si quedó algo escrito/marcado
                applyFilters();

            } else {
                dashboardContainer.innerHTML = `<p style="color: red;">❌ Error: ${result.error}</p>`;
            }
        } catch (error) {
            dashboardContainer.innerHTML = `<p style="color: red;">❌ Error de red: ${error.message}</p>`;
        }
    };

    // --- MOTOR DE FILTRADO COMBINADO ---
    const applyFilters = () => {
        const term = (searchInput?.value || '').toLowerCase();
        const onlyTransit = transitCheckbox?.checked || false;
        
        const rows = dashboardContainer.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const sku = row.cells[0].textContent.toLowerCase();
            const name = row.cells[1].textContent.toLowerCase();
            // Verifica si la fila tiene la etiqueta de tránsito
            const hasTransit = row.querySelector('.transit-badge') !== null;
            
            const matchesSearch = sku.includes(term) || name.includes(term);
            const matchesTransit = !onlyTransit || hasTransit;
            
            if (matchesSearch && matchesTransit) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    };

    // Eventos de Filtrado
    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (transitCheckbox) transitCheckbox.addEventListener('change', applyFilters);

    // --- EXPORTACIÓN A EXCEL ---
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            let csv = [];
            // Toma todas las filas de la tabla (incluyendo el header)
            const rows = dashboardContainer.querySelectorAll('table tr');
            
            rows.forEach(row => {
                // Solo exporta las filas que están visibles (respeta el buscador)
                if (row.style.display !== 'none') {
                    let cols = row.querySelectorAll('td, th');
                    let rowData = [];
                    cols.forEach(col => {
                        // Limpia la celda: quita emojis de avión y saltos de línea para el Excel
                        let text = col.innerText.replace(/\n/g, ' ').replace(/✈️/g, '').trim();
                        // Envuelve en comillas por si hay comas en los nombres de productos
                        rowData.push(`"${text}"`);
                    });
                    csv.push(rowData.join(','));
                }
            });

            // Genera y descarga el archivo CSV
            const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.setAttribute("download", `Inventario_Viiggo_Global.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    loadDashboard();
    if (refreshBtn) refreshBtn.addEventListener('click', loadDashboard);
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
// MÓDULO: RADAR EN TRÁNSITO
// ====================================================================
const transitViewContainer = document.getElementById('active-transits-container');
const filterOrigin = document.getElementById('filter-origin');
const filterDest = document.getElementById('filter-dest');
const refreshTransitsBtn = document.getElementById('refresh-transits');

if (transitViewContainer) {
    const loadActiveTransits = async () => {
        transitViewContainer.innerHTML = '<p>⏳ Escaneando radar logístico...</p>';
        try {
            const res = await fetch('/api/active_transits');
            const result = await res.json();
            
            if (res.ok && result.data) {
                window.transitData = result.data; // Guardamos en memoria para los filtros rápidos
                renderTransitTable();
            } else {
                transitViewContainer.innerHTML = `<p style="color:red;">❌ Error: ${result.error}</p>`;
            }
        } catch (error) {
            transitViewContainer.innerHTML = `<p style="color:red;">❌ Error de conexión: ${error.message}</p>`;
        }
    };

    const renderTransitTable = () => {
        if (!window.transitData || window.transitData.length === 0) {
            transitViewContainer.innerHTML = `
                <div style="text-align:center; padding:40px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px;">
                    <span style="font-size:2rem;">🚢</span>
                    <p style="color:#64748b; margin-top:10px;">No hay mercadería en tránsito en este momento.</p>
                </div>`;
            return;
        }

        const origFilter = filterOrigin.value;
        const destFilter = filterDest.value;

        // Filtrar datos en vivo
        const filtered = window.transitData.filter(item => {
            const matchOrig = origFilter === 'ALL' || item.origin === origFilter;
            const matchDest = destFilter === 'ALL' || item.destination === destFilter;
            return matchOrig && matchDest;
        });

        if (filtered.length === 0) {
            transitViewContainer.innerHTML = '<p style="color:#64748b; padding: 20px;">Ningún despacho coincide con estos filtros.</p>';
            return;
        }

        let html = `
            <table class="excel-table">
                <thead>
                    <tr>
                        <th style="width: 100px;">Orden #</th>
                        <th>🛫 Origen</th>
                        <th>🛬 Destino</th>
                        <th>SKU</th>
                        <th>Producto</th>
                        <th>Cantidad</th>
                        <th>ETA (Llegada)</th>
                    </tr>
                </thead>
                <tbody>
        `;

        filtered.forEach(item => {
            const etaDate = new Date(item.estimated_arrival).toLocaleDateString('es-ES');
            
            html += `
                <tr>
                    <td style="text-align:center;"><strong>${item.transfer_id}</strong></td>
                    <td>${item.origin}</td>
                    <td>${item.destination}</td>
                    <td><strong>${item.sku}</strong></td>
                    <td>${item.product}</td>
                    <td style="color: #d97706; font-weight:bold;">${item.quantity}</td>
                    <td style="font-weight:500;">${etaDate}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        transitViewContainer.innerHTML = html;
    };

    // Listeners para re-dibujar la tabla al instante cuando tocas un filtro
    if (filterOrigin) filterOrigin.addEventListener('change', renderTransitTable);
    if (filterDest) filterDest.addEventListener('change', renderTransitTable);
    if (refreshTransitsBtn) refreshTransitsBtn.addEventListener('click', loadActiveTransits);

    // Cargar datos al abrir la página
    loadActiveTransits();
}

// ====================================================================
// MÓDULO 6: GESTOR DE PRECIOS HÍBRIDO (Excel + Edición Manual)
// ====================================================================
const priceLoadBtn = document.getElementById('load-prices-btn');
const pricesTable = document.getElementById('prices-table');
const pricesTbody = document.getElementById('prices-tbody');
const priceStatus = document.getElementById('price-list-status');
const savePricesBtn = document.getElementById('save-prices-btn');
const priceExcelInput = document.getElementById('price-excel-file');

if (priceLoadBtn) {
    // 1. Consultar Precios Actuales
    priceLoadBtn.addEventListener('click', async () => {
        const nodeId = document.getElementById('price-node-select').value;
        priceStatus.innerHTML = '⏳ Cargando lista de precios...';
        priceStatus.style.display = 'block';
        pricesTable.style.display = 'none';
        savePricesBtn.style.display = 'none';

        try {
            const res = await fetch(`/api/prices?node=${nodeId}`);
            const result = await res.json();
            if (res.ok && result.data) {
                renderPriceRows(result.data);
            }
        } catch (err) { priceStatus.innerText = '❌ Error al conectar.'; }
    });

    // 2. Procesar Excel y volcarlo a la tabla (Pre-visualización)
    priceExcelInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (evt) => {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet);
            
            // Mapeamos el excel a la estructura de la tabla
            const previewData = json.map(row => ({
                product_id: row.ID || row.id || null, // Si no viene ID, el backend lo buscará por SKU
                sku: row.SKU || row.sku,
                name: row.Nombre || row.name || 'Carga desde Excel',
                price: row.Precio || row.price || 0
            }));

            renderPriceRows(previewData);
            priceStatus.innerHTML = '✨ <span style="color:green;">Excel cargado en la tabla. Revisa y guarda los cambios.</span>';
        };
        reader.readAsArrayBuffer(file);
    });

    // Función para dibujar las filas editables
    const renderPriceRows = (data) => {
        pricesTbody.innerHTML = '';
        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.sku}</strong></td>
                <td>${item.name}</td>
                <td>
                    <input type="number" step="0.01" class="price-input" 
                           data-sku="${item.sku}" 
                           data-pid="${item.product_id || ''}" 
                           value="${item.price}">
                </td>
            `;
            pricesTbody.appendChild(tr);
        });
        priceStatus.style.display = 'none';
        pricesTable.style.display = 'table';
        savePricesBtn.style.display = 'inline-flex';
    };

    // 3. Guardar cambios (Vengan de edición manual o de Excel)
    savePricesBtn.addEventListener('click', async () => {
        const nodeId = document.getElementById('price-node-select').value;
        const inputs = document.querySelectorAll('.price-input');
        const prices = Array.from(inputs).map(inp => ({
            productId: inp.getAttribute('data-pid'),
            sku: inp.getAttribute('data-sku'),
            price: inp.value
        }));

        savePricesBtn.disabled = true;
        savePricesBtn.innerText = '⏳ Guardando...';

        try {
            const res = await fetch('/api/prices', {
                method: 'POST',
                body: JSON.stringify({ nodeId, prices }),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                alert('✅ Lista de precios actualizada correctamente.');
                savePricesBtn.innerText = '💾 Guardar Cambios en la Lista';
            }
        } catch (err) { alert('❌ Error al guardar.'); }
        savePricesBtn.disabled = false;
    });
}

// ====================================================================
// MÓDULO 7: DOCUMENTACIÓN (Proformas PDF/Excel)
// ====================================================================
const loadDocsBtn = document.getElementById('load-transfers-btn');
const docsContainer = document.getElementById('docs-list-container');

if (loadDocsBtn) {
    loadDocsBtn.addEventListener('click', async () => {
        const nodeId = document.getElementById('doc-node-select').value;
        docsContainer.innerHTML = '<div style="grid-column: 1/-1; text-align:center;">⏳ Buscando expedientes...</div>';

        try {
            const res = await fetch(`/api/proformas?node=${nodeId}`);
            const result = await res.json();

            if (res.ok && result.data && result.data.length > 0) {
                let html = '';
                
                // Ordenar de más reciente a más antiguo
                const sortedData = result.data.sort((a, b) => new Date(b.date) - new Date(a.date));

                sortedData.forEach(t => {
                    // Calculamos el valor total para mostrarlo en la tarjeta
                    const totalInvoice = t.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
                    const formattedDate = new Date(t.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

                    html += `
                        <div class="doc-card">
                            <div class="doc-header">
                                <span class="doc-title">Orden #${t.id}</span>
                                <span class="doc-date">📅 ${formattedDate}</span>
                            </div>
                            <div class="doc-info">
                                <p><strong>Destino:</strong> ${t.destination}</p>
                                <p><strong>Valor Total:</strong> $${totalInvoice.toFixed(2)} USD</p>
                                <p><strong>Artículos:</strong> ${t.items.length} SKUs distintos</p>
                            </div>
                            <div class="doc-actions">
                                <button class="btn-excel" onclick="exportToExcel(${JSON.stringify(t).replace(/"/g, '&quot;')})">
                                    📊 CSV
                                </button>
                                <button class="btn-pdf" onclick="exportToPDF(${JSON.stringify(t).replace(/"/g, '&quot;')})">
                                    📄 PDF
                                </button>
                            </div>
                        </div>
                    `;
                });
                docsContainer.innerHTML = html;
            } else {
                docsContainer.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 40px; border: 1px dashed #cbd5e1; border-radius: 8px; background: #f8fafc;">
                        <p style="color: #64748b;">No se encontraron transferencias recientes para este destino.</p>
                    </div>`;
            }
        } catch (err) { 
            docsContainer.innerHTML = `<div style="grid-column: 1/-1; color:red; text-align:center;">${err.message}</div>`; 
        }
    });
}

// Exportación CSV (Excel)
window.exportToExcel = (data) => {
    let csv = 'SKU,Producto,Cantidad,Precio Unitario (USD),Total (USD)\n';
    data.items.forEach(item => {
        // Limpiamos comas en los nombres para no romper el CSV
        const cleanName = item.product_name.replace(/,/g, '');
        csv += `${item.sku},${cleanName},${item.quantity},${item.price},${(item.quantity * item.price).toFixed(2)}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Proforma_Viiggo_Orden_${data.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// Generador de PDF Nativo
window.exportToPDF = (data) => {
    const printWindow = window.open('', '_blank');
    let itemsHtml = '';
    let total = 0;
    
    data.items.forEach(item => {
        const subtotal = item.quantity * item.price;
        total += subtotal;
        itemsHtml += `
            <tr>
                <td style="padding:10px; border-bottom:1px solid #eee;">${item.sku}</td>
                <td style="padding:10px; border-bottom:1px solid #eee; color:#555;">${item.product_name}</td>
                <td style="padding:10px; border-bottom:1px solid #eee; text-align:center;">${item.quantity}</td>
                <td style="padding:10px; border-bottom:1px solid #eee; text-align:right;">$${item.price.toFixed(2)}</td>
                <td style="padding:10px; border-bottom:1px solid #eee; text-align:right; font-weight:bold;">$${subtotal.toFixed(2)}</td>
            </tr>`;
    });

    const docDate = new Date(data.date).toLocaleDateString('es-ES');

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Proforma Invoice #${data.id}</title>
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
                .header { border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 30px; }
                .title { margin: 0; font-size: 28px; color: #0f172a; text-transform: uppercase; letter-spacing: 1px; }
                .subtitle { margin: 5px 0 0 0; color: #64748b; font-size: 14px; }
                .info-table { width: 100%; margin-bottom: 40px; font-size: 14px; }
                .info-table td { padding: 5px 0; }
                .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                .items-table th { background: #f8fafc; padding: 12px 10px; text-align: left; font-size: 12px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; }
                .total-row th { font-size: 18px; color: #0f172a; padding-top: 20px; }
                .footer { margin-top: 50px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1 class="title">PROFORMA INVOICE</h1>
                <p class="subtitle">VIIGGO PROFESSIONAL WMS - International Logistics</p>
            </div>
            
            <table class="info-table">
                <tr>
                    <td><strong>Transfer Order:</strong> #${data.id}</td>
                    <td style="text-align:right;"><strong>Date of Issue:</strong> ${docDate}</td>
                </tr>
                <tr>
                    <td><strong>Origin:</strong> China Central Warehouse</td>
                    <td style="text-align:right;"><strong>Destination:</strong> ${data.destination}</td>
                </tr>
            </table>

            <table class="items-table">
                <thead>
                    <tr>
                        <th>SKU</th>
                        <th>Descripción</th>
                        <th style="text-align:center;">Qty</th>
                        <th style="text-align:right;">Unit Price</th>
                        <th style="text-align:right;">Subtotal</th>
                    </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
                <tfoot>
                    <tr class="total-row">
                        <th colspan="4" style="text-align:right;">TOTAL AMOUNT (USD):</th>
                        <th style="text-align:right;">$${total.toFixed(2)}</th>
                    </tr>
                </tfoot>
            </table>
            
            <div class="footer">
                Terms: Intercompany transfer. Goods in transit are insured by Viiggo Logistics Group.<br>
                Document generated automatically by Viiggo WMS.
            </div>
        </body>
        </html>
    `);
    
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
};
// ====================================================================
// UTILIDADES: GESTIÓN DE FÁBRICAS Y AUTOCOMPLETADO DE SKU
// ====================================================================
const manSkuInput = document.getElementById('man-sku');
const manFabSelect = document.getElementById('man-fab');
const btnAddFactory = document.getElementById('btn-add-factory');
const skuHelper = document.getElementById('sku-helper');

// 1. Cargar las fábricas en el select al abrir la página
const loadFactories = async () => {
    if (!manFabSelect) return;
    try {
        const res = await fetch('/api/factories');
        const result = await res.json();
        if (res.ok && result.data) {
            // Guardamos la opción seleccionada actualmente si existe
            const currentVal = manFabSelect.value;
            manFabSelect.innerHTML = '<option value="">Seleccione una fábrica...</option>';
            result.data.forEach(f => {
                manFabSelect.innerHTML += `<option value="${f.name}">${f.name}</option>`;
            });
            if (currentVal) manFabSelect.value = currentVal;
        }
    } catch (e) { console.error('Error cargando fábricas'); }
};

if (manFabSelect) loadFactories();

// 2. Crear nueva fábrica
if (btnAddFactory) {
    btnAddFactory.addEventListener('click', async (e) => {
        e.preventDefault();
        const newFactory = prompt("Ingresa el nombre exacto de la nueva fábrica (Ej: Yiwu Electronics):");
        if (!newFactory || newFactory.trim() === "") return;

        try {
            const res = await fetch('/api/factories', {
                method: 'POST',
                body: JSON.stringify({ name: newFactory }),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                alert(`✅ Fábrica "${newFactory}" agregada con éxito.`);
                await loadFactories();
                manFabSelect.value = newFactory.trim();
            } else {
                const err = await res.json();
                alert(`❌ Error: ${err.error}`);
            }
        } catch (e) { alert("Error de conexión"); }
    });
}

// 3. Autocompletado al escribir el SKU
if (manSkuInput) {
    // Evento "blur" se dispara cuando el usuario sale de la caja de texto del SKU
    manSkuInput.addEventListener('blur', async () => {
        const sku = manSkuInput.value.trim();
        if (!sku) return;

        skuHelper.style.display = 'block';
        skuHelper.innerText = 'Buscando datos del producto...';

        try {
            const res = await fetch(`/api/product?sku=${encodeURIComponent(sku)}`);
            const result = await res.json();

            if (res.ok && result.data) {
                skuHelper.innerText = '✅ Artículo encontrado. Autocompletado.';
                skuHelper.style.color = 'green';
                
                // Rellenar campos
                document.getElementById('man-name').value = result.data.name || '';
                document.getElementById('man-cat').value = result.data.category || '';
                
                // Si la fábrica existe en nuestro select, la marcamos
                if (result.data.factory_name) {
                    const exists = Array.from(manFabSelect.options).some(opt => opt.value === result.data.factory_name);
                    if (exists) {
                        manFabSelect.value = result.data.factory_name;
                    }
                }
            } else {
                skuHelper.innerText = '✨ Nuevo artículo (No registrado)';
                skuHelper.style.color = 'var(--text-muted)';
            }
        } catch (e) {
            skuHelper.style.display = 'none';
        }
        
        // Ocultar el mensaje de ayuda después de 3 segundos
        setTimeout(() => { skuHelper.style.display = 'none'; }, 3000);
    });
}

const loadNodes = async () => {
    const container = document.getElementById('node-list-container');
    if (!container) return;
    const res = await fetch('/api/nodes');
    const result = await res.json();
    if (res.ok) {
        container.innerHTML = result.data.map(n => `
            <div class="factory-item">
                <span><strong>[${n.display_order}]</strong> ${n.name}</span>
                <div>
                    <button class="action-btn" onclick="editNode(${n.id}, '${n.name}', ${n.display_order})">✏️</button>
                    <button class="action-btn delete" onclick="deleteNode(${n.id})">🗑️</button>
                </div>
            </div>
        `).join('');
    }
};

window.editNode = async (id, oldName, oldOrder) => {
    const name = prompt("Nombre del depósito:", oldName);
    const order = prompt("Orden en el dashboard:", oldOrder);
    if (name && order) {
        await fetch('/api/nodes', { 
            method: 'PUT', 
            body: JSON.stringify({ id, name, order: parseInt(order) }), 
            headers: {'Content-Type': 'application/json'} 
        });
        loadNodes();
    }
};

document.getElementById('btn-add-node')?.addEventListener('click', async () => {
    const name = document.getElementById('node-name-input').value;
    const order = document.getElementById('node-order-input').value;
    await fetch('/api/nodes', { 
        method: 'POST', 
        body: JSON.stringify({ name, order: parseInt(order) }), 
        headers: {'Content-Type': 'application/json'} 
    });
    loadNodes();
});

// Inicializar
loadNodes();
