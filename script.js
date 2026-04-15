// ====================================================================
// UTILIDAD GENERAL: Obtener ID de Usuario para Auditoría
// ====================================================================
const getUserId = () => {
    const token = localStorage.getItem('viggo_auth_token');
    if (!token) return null;
    try {
        const payload = JSON.parse(atob(token));
        return payload.id;
    } catch (e) {
        return null;
    }
};

// ====================================================================
// MOSTRAR USUARIO LOGUEADO EN EL SIDEBAR
// ====================================================================
document.addEventListener("DOMContentLoaded", () => {
    const userNameElement = document.querySelector('.brand-text strong');
    const userRoleElement = document.querySelector('.brand-text small');
    const savedName = localStorage.getItem('viggo_user_name');
    const savedRole = localStorage.getItem('viggo_user_role');
    
    if (userNameElement && savedName) {
        userNameElement.innerText = `Usuario: ${savedName}`;
    }
    if (userRoleElement && savedRole) {
        userRoleElement.innerText = savedRole;
    }
});

// ====================================================================
// MÓDULO 1: INGRESO HÍBRIDO (Manual + Excel)
// ====================================================================
const btnManual = document.getElementById('btn-submit-manual');
const btnExcel = document.getElementById('btn-submit-excel');
const inboundStatus = document.getElementById('inbound-status');

async function sendInboundData(nodeId, itemsArray, btnElement) {
    btnElement.disabled = true;
    const originalText = btnElement.innerText;
    btnElement.innerText = '⏳ Procesando...';
    inboundStatus.innerHTML = '<span style="color:black;">Comunicando con la base de datos...</span>';

    try {
        const res = await fetch('/api/inbound', {
            method: 'POST',
            body: JSON.stringify({ nodeId: nodeId, items: itemsArray, userId: getUserId() }),
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await res.json();

        if (res.ok) {
            inboundStatus.innerHTML = `✅ <span style="color:green;">${result.message}</span>`;
            return true;
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
            document.getElementById('man-sku').value = '';
            document.getElementById('man-qty').value = '';
        }
    });
}

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
                document.getElementById('drop-zone').style.display = 'block';
                document.getElementById('file-info').style.display = 'none';
                fileInput.value = '';
            }
        };
        reader.readAsArrayBuffer(fileInput.files[0]);
    });
}

// ====================================================================
// MÓDULO 2: DISTRIBUCIÓN Y FACTURACIÓN (Actualizado con Contenedor)
// ====================================================================
const dispatchBtn = document.getElementById('dispatch-btn');

if (dispatchBtn) {
    dispatchBtn.addEventListener('click', async () => {
        const origen = document.getElementById('origen-select').value;
        const destino = document.getElementById('destino-select').value;
        const transporte = document.getElementById('transporte-select').value;
        const containerNumber = document.getElementById('container-input')?.value || '';
        const fileInput = document.getElementById('dist-excel-file');
        const statusBox = document.getElementById('transfer-status');

        if (origen === destino) {
            statusBox.innerHTML = '⚠️ <span style="color:red;">El origen y destino no pueden ser iguales.</span>';
            return;
        }

        if (!fileInput.files.length) {
            statusBox.innerHTML = '⚠️ <span style="color:red;">Por favor, sube el Excel primero.</span>';
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

                if (jsonData.length === 0) throw new Error("Excel vacío");

                statusBox.innerHTML = `🚀 <span style="color:black;">Asignando contenedor y despachando...</span>`;

                const res = await fetch('/api/transfer', {
                    method: 'POST',
                    body: JSON.stringify({ 
                        origen, 
                        destino, 
                        transporte, 
                        containerNumber, 
                        items: jsonData,
                        userId: getUserId() // Para la auditoría
                    }),
                    headers: { 'Content-Type': 'application/json' }
                });

                const result = await res.json();

                if (res.ok) {
                    statusBox.innerHTML = `<span style="color:green;">✅ ${result.message}<br>🚢 ETA Puerto: ${result.eta} | 🏢 Disp. Depósito: ${result.availability}</span>`;
                    document.getElementById('dist-drop-zone').style.display = 'block';
                    document.getElementById('dist-file-info').style.display = 'none';
                    fileInput.value = '';
                    if(document.getElementById('container-input')) document.getElementById('container-input').value = '';
                } else {
                    statusBox.innerHTML = `❌ <span style="color:red;">${result.error}</span>`;
                }
            } catch (error) {
                statusBox.innerHTML = `❌ <span style="color:red;">Error: Revisa el formato del Excel.</span>`;
            } finally {
                dispatchBtn.disabled = false;
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

// ====================================================================
// MÓDULO 3: DASHBOARD GLOBAL
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

            if (res.ok && result.data && result.nodes) {
                const nodes = result.nodes;
                const inventory = result.data;

                if (inventory.length === 0) {
                    dashboardContainer.innerHTML = '<p style="color: gray;">Sin stock registrado en el sistema.</p>';
                    return;
                }

                const productMap = new Map();

                inventory.forEach(row => {
                    if (!productMap.has(row.sku)) {
                        const defaultStock = {};
                        nodes.forEach(n => defaultStock[n.id] = { phys: 0, trans: 0 });
                        productMap.set(row.sku, { name: row.product_name, stock: defaultStock });
                    }
                    if (row.node_id) {
                        productMap.get(row.sku).stock[row.node_id] = { phys: row.quantity || 0, trans: row.transit_qty || 0 };
                    }
                });

                let html = '<table class="excel-table"><thead><tr>';
                html += '<th>SKU</th><th>Producto</th>';
                nodes.forEach(n => html += `<th>${n.name}</th>`);
                html += '</tr></thead><tbody>';

                productMap.forEach((data, sku) => {
                    html += `<tr><td><strong>${sku}</strong></td><td>${data.name}</td>`;
                    nodes.forEach(n => {
                        const stock = data.stock[n.id];
                        const transHtml = stock.trans > 0 ? `<span class="transit-badge" style="color:#d97706; font-size:0.8rem; margin-left:5px;">✈️ +${stock.trans}</span>` : '';
                        html += `<td>${stock.phys} ${transHtml}</td>`;
                    });
                    html += '</tr>';
                });

                html += '</tbody></table>';
                dashboardContainer.innerHTML = html;
                applyFilters();

            } else {
                dashboardContainer.innerHTML = `<p style="color: red;">❌ Error: ${result.error || 'Estructura de datos inválida'}</p>`;
            }
        } catch (error) {
            dashboardContainer.innerHTML = `<p style="color: red;">❌ Error de red: ${error.message}</p>`;
        }
    };

    const applyFilters = () => {
        const term = (searchInput?.value || '').toLowerCase();
        const onlyTransit = transitCheckbox?.checked || false;
        const rows = dashboardContainer.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const sku = row.cells[0].textContent.toLowerCase();
            const name = row.cells[1].textContent.toLowerCase();
            const hasTransit = row.querySelector('.transit-badge') !== null;
            const matchesSearch = sku.includes(term) || name.includes(term);
            const matchesTransit = !onlyTransit || hasTransit;
            row.style.display = (matchesSearch && matchesTransit) ? '' : 'none';
        });
    };

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (transitCheckbox) transitCheckbox.addEventListener('change', applyFilters);

    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            let csv = [];
            const rows = dashboardContainer.querySelectorAll('table tr');
            rows.forEach(row => {
                if (row.style.display !== 'none') {
                    let cols = row.querySelectorAll('td, th');
                    let rowData = [];
                    cols.forEach(col => {
                        let text = col.innerText.replace(/\n/g, ' ').replace(/✈️/g, '').trim();
                        rowData.push(`"${text}"`);
                    });
                    csv.push(rowData.join(','));
                }
            });
            const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.setAttribute("download", `Inventario_VIGGO_Global.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    loadDashboard();
    if (refreshBtn) refreshBtn.addEventListener('click', loadDashboard);
}

// ====================================================================
// MÓDULO 4: RECEPCIÓN DE MERCADERÍA
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
                                body: JSON.stringify({ nodeId: nId, productId: pId, qty: q, userId: getUserId() }),
                                headers: { 'Content-Type': 'application/json' }
                            });
                            const rxData = await rx.json();

                            if (rx.ok) {
                                msgBox.style.color = 'green';
                                msgBox.innerText = `✅ Éxito: ${rxData.message}`;
                                targetBtn.parentElement.parentElement.style.opacity = '0.3'; 
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
// MÓDULO 5: RADAR EN TRÁNSITO
// ====================================================================
const transitViewContainer = document.getElementById('active-transits-container');
const filterOrigin = document.getElementById('filter-origin');
const filterDest = document.getElementById('filter-dest');
const searchTransit = document.getElementById('search-transit'); 
const refreshTransitsBtn = document.getElementById('refresh-transits');

if (transitViewContainer) {
    const loadActiveTransits = async () => {
        transitViewContainer.innerHTML = '<p>⏳ Escaneando radar logístico...</p>';
        try {
            const res = await fetch('/api/active_transits');
            const result = await res.json();
            
            if (res.ok && result.data) {
                window.transitData = result.data; 
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

        const origFilter = filterOrigin ? filterOrigin.value : 'ALL';
        const destFilter = filterDest ? filterDest.value : 'ALL';
        const searchTerm = searchTransit ? searchTransit.value.toLowerCase().trim() : '';

        const filtered = window.transitData.filter(item => {
            const matchOrig = origFilter === 'ALL' || item.origin === origFilter;
            const matchDest = destFilter === 'ALL' || item.destination === destFilter;
            
            const containerStr = (item.container_number || 'PENDIENTE').toLowerCase();
            const skuStr = (item.sku || '').toLowerCase();
            const prodStr = (item.product || '').toLowerCase();
            
            const matchSearch = !searchTerm || containerStr.includes(searchTerm) || skuStr.includes(searchTerm) || prodStr.includes(searchTerm);

            return matchOrig && matchDest && matchSearch;
        });

        if (filtered.length === 0) {
            transitViewContainer.innerHTML = '<p style="color:#64748b; padding: 20px;">Ningún despacho coincide con estos filtros.</p>';
            return;
        }

        let html = `
            <table class="excel-table">
                <thead>
                    <tr>
                        <th>📦 Contenedor</th>
                        <th>🛫 Origen</th>
                        <th>🛬 Destino</th>
                        <th>SKU</th>
                        <th>Producto</th>
                        <th style="text-align:center;">Cantidad</th>
                        <th>🚢 ETA Puerto</th>
                        <th style="color:#10b981;">🏢 Disp. Depósito</th>
                    </tr>
                </thead>
                <tbody>
        `;

        filtered.forEach(item => {
            const formatD = (dStr) => {
                if(!dStr) return 'Calculando...';
                try {
                    const parts = dStr.split('T')[0].split('-');
                    if(parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
                    return dStr;
                } catch(e) { return dStr; }
            };

            const etaDate = formatD(item.estimated_arrival);
            const availDate = formatD(item.availability_date);
            const containerDisplay = item.container_number || 'PENDIENTE';
            
            html += `
                <tr>
                    <td><strong style="color: #0369a1;">${containerDisplay.toUpperCase()}</strong></td>
                    <td>${item.origin}</td>
                    <td>${item.destination}</td>
                    <td><strong>${item.sku}</strong></td>
                    <td>${item.product}</td>
                    <td style="color: #d97706; font-weight:bold; text-align:center;">${item.quantity}</td>
                    <td style="font-weight:500;">${etaDate}</td>
                    <td style="font-weight:bold; color:#10b981;">${availDate}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        transitViewContainer.innerHTML = html;
    };

    if (filterOrigin) filterOrigin.addEventListener('change', renderTransitTable);
    if (filterDest) filterDest.addEventListener('change', renderTransitTable);
    if (searchTransit) searchTransit.addEventListener('input', renderTransitTable);
    if (refreshTransitsBtn) refreshTransitsBtn.addEventListener('click', loadActiveTransits);

    loadActiveTransits();
}

// ====================================================================
// MÓDULO 6: GESTOR DE PRECIOS
// ====================================================================
const priceLoadBtn = document.getElementById('load-prices-btn');
const pricesTable = document.getElementById('prices-table');
const pricesTbody = document.getElementById('prices-tbody');
const priceStatus = document.getElementById('price-list-status');
const savePricesBtn = document.getElementById('save-prices-btn');
const priceExcelInput = document.getElementById('price-excel-file');

if (savePricesBtn) {
    savePricesBtn.style.display = 'inline-flex';
}

if (priceLoadBtn) {
    priceLoadBtn.addEventListener('click', async () => {
        const nodeId = document.getElementById('price-node-select').value;
        priceStatus.innerHTML = '⏳ Cargando lista de precios...';
        priceStatus.style.display = 'block';
        pricesTable.style.display = 'none';

        try {
            const res = await fetch(`/api/prices?node=${nodeId}`);
            const result = await res.json();
            if (res.ok && result.data) {
                renderPriceRows(result.data);
            }
        } catch (err) { priceStatus.innerText = '❌ Error al conectar.'; }
    });

    if(priceExcelInput) {
        priceExcelInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (evt) => {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet);
                
                const previewData = json.map(row => {
                    let sku = '', name = 'Actualización rápida', price = 0, product_id = null;
                    
                    for (const key in row) {
                        const k = key.trim().toLowerCase();
                        if (k === 'sku') sku = row[key].toString().trim();
                        if (k === 'nombre' || k === 'name' || k === 'producto') name = row[key].toString().trim();
                        if (k === 'precio' || k === 'price') price = parseFloat(row[key]) || 0;
                        if (k === 'id') product_id = row[key];
                    }
                    return { product_id, sku, name, price };
                });

                const validData = previewData.filter(item => item.sku !== '');
                renderPriceRows(validData);
                priceStatus.innerHTML = '✨ <span style="color:green;">Excel cargado. Revisa y haz clic en "Guardar Cambios".</span>';
                priceExcelInput.value = ''; 
            };
            reader.readAsArrayBuffer(file);
        });
    }

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
    };

    if (savePricesBtn) {
        savePricesBtn.addEventListener('click', async () => {
            const nodeId = document.getElementById('price-node-select').value;
            const inputs = document.querySelectorAll('.price-input');
            
            if (inputs.length === 0) {
                alert('⚠️ No hay precios en la tabla para guardar. Carga un Excel o consulta la lista primero.');
                return;
            }

            const prices = Array.from(inputs).map(inp => ({
                productId: inp.getAttribute('data-pid'),
                sku: inp.getAttribute('data-sku'),
                price: inp.value
            }));

            savePricesBtn.disabled = true;
            const originalText = savePricesBtn.innerText;
            savePricesBtn.innerText = '⏳ Guardando...';

            try {
                const res = await fetch('/api/prices', {
                    method: 'POST',
                    body: JSON.stringify({ 
                        nodeId, 
                        prices,
                        userId: getUserId() // Para la auditoría
                    }),
                    headers: { 'Content-Type': 'application/json' }
                });
                
                const result = await res.json();
                
                if (res.ok) {
                    alert('✅ ' + (result.message || 'Lista de precios actualizada correctamente.'));
                    pricesTable.style.display = 'none';
                    priceStatus.style.display = 'block';
                    priceStatus.innerHTML = '✅ <span style="color:green;">Precios guardados. Puedes hacer otra carga.</span>';
                } else {
                    alert('❌ Error: ' + result.error);
                }
            } catch (err) { 
                alert('❌ Error de conexión al guardar.'); 
            } finally {
                savePricesBtn.disabled = false;
                savePricesBtn.innerText = originalText;
            }
        });
    }
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
                const sortedData = result.data.sort((a, b) => new Date(b.date) - new Date(a.date));

                sortedData.forEach(t => {
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
                                <button class="btn-excel" onclick="exportToExcel(${JSON.stringify(t).replace(/"/g, '&quot;')})">📊 CSV</button>
                                <button class="btn-pdf" onclick="exportToPDF(${JSON.stringify(t).replace(/"/g, '&quot;')})">📄 PDF</button>
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
        } catch (err) { docsContainer.innerHTML = `<div style="grid-column: 1/-1; color:red; text-align:center;">${err.message}</div>`; }
    });
}

window.exportToExcel = (data) => {
    let csv = 'SKU,Producto,Cantidad,Precio Unitario (USD),Total (USD)\n';
    data.items.forEach(item => {
        const cleanName = item.product_name.replace(/,/g, '');
        csv += `${item.sku},${cleanName},${item.quantity},${item.price},${(item.quantity * item.price).toFixed(2)}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Proforma_VIGGO_Orden_${data.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

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
                <p class="subtitle">VIGGO PROFESSIONAL WMS - International Logistics</p>
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
                <thead><tr><th>SKU</th><th>Descripción</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Unit Price</th><th style="text-align:right;">Subtotal</th></tr></thead>
                <tbody>${itemsHtml}</tbody>
                <tfoot><tr class="total-row"><th colspan="4" style="text-align:right;">TOTAL AMOUNT (USD):</th><th style="text-align:right;">$${total.toFixed(2)}</th></tr></tfoot>
            </table>
            <div class="footer">Terms: Intercompany transfer. Goods in transit are insured by VIGGO Logistics Group.<br>Document generated automatically by VIGGO WMS.</div>
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

const loadFactories = async () => {
    if (!manFabSelect) return;
    try {
        const res = await fetch('/api/factories');
        const result = await res.json();
        if (res.ok && result.data) {
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

if (manSkuInput) {
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
                document.getElementById('man-name').value = result.data.name || '';
                document.getElementById('man-cat').value = result.data.category || '';
                if (result.data.factory_name) {
                    const exists = Array.from(manFabSelect.options).some(opt => opt.value === result.data.factory_name);
                    if (exists) manFabSelect.value = result.data.factory_name;
                }
            } else {
                skuHelper.innerText = '✨ Nuevo artículo (No registrado)';
                skuHelper.style.color = 'var(--text-muted)';
            }
        } catch (e) { skuHelper.style.display = 'none'; }
        
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

loadNodes();
