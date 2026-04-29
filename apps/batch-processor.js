// DIFAL-Bot - Batch Processor Module
(function() {
  'use strict';
  
  console.log('📦 Módulo batch carregado');
  
  const batchState = { files: [], results: [], processing: false };
  
  // Tab switching
  window.switchTab = function(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    
    const btn = document.getElementById('tab-btn-' + tabName);
    const content = document.getElementById('tab-' + tabName);
    
    if (btn) btn.classList.add('active');
    if (content) content.classList.add('active');
  };
  
  // Handle file selection
  function handleBatchFiles(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    
    batchState.files = files.map((file, i) => ({
      id: `file-${Date.now()}-${i}`,
      file: file,
      name: file.name,
      status: 'pending',
      result: null
    }));
    
    renderFileList();
    document.getElementById('batch-process-btn').style.display = 'block';
    document.getElementById('batch-upf').textContent = `📎 ${files.length} arquivo(s)`;
  }
  
  function renderFileList() {
    const listEl = document.getElementById('batch-files-list');
    if (!listEl) return;
    
    listEl.innerHTML = batchState.files.map(f => `
      <div class="batch-file-item">
        <div class="batch-file-name">${Utils.esc(f.name)}</div>
        <div class="batch-file-status ${f.status}">${getStatusLabel(f.status)}</div>
        ${f.status === 'pending' ? `<button class="batch-file-remove" onclick="removeBatchFile('${f.id}')">✕</button>` : ''}
      </div>
    `).join('');
  }
  
  function getStatusLabel(status) {
    return { pending: 'Aguardando', processing: 'Processando...', success: 'Concluído', error: 'Erro' }[status] || status;
  }
  
  window.removeBatchFile = function(fileId) {
    batchState.files = batchState.files.filter(f => f.id !== fileId);
    renderFileList();
    if (batchState.files.length === 0) {
      document.getElementById('batch-process-btn').style.display = 'none';
      document.getElementById('batch-upf').textContent = '';
    }
  };
  
  // Process single file
  async function processFile(fileItem) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const xml = new DOMParser().parseFromString(e.target.result, 'text/xml');
          const result = await analyzeXML(xml, fileItem.name);
          resolve({ success: true, result });
        } catch (error) {
          resolve({ success: false, error: error.message });
        }
      };
      reader.onerror = () => resolve({ success: false, error: 'Erro ao ler arquivo' });
      reader.readAsText(fileItem.file, 'UTF-8');
    });
  }
  
  async function analyzeXML(xml, filename) {
    const emit = xml.getElementsByTagName('emit')[0];
    const dest = xml.getElementsByTagName('dest')[0];
    
    const ufO = emit ? gT(emit, 'UF') : '';
    const ufD = dest ? gT(dest, 'UF') : '';
    const emitNome = emit ? (gT(emit, 'xNome') || gT(emit, 'xFant') || 'Não informado') : 'Não informado';
    const indF = gT(xml, 'indFinal');
    const indIE = gT(xml, 'indIEDest');
    const crt = gT(xml, 'CRT');
    const vNF = gT(xml, 'vNF');
    const dhEmi = gT(xml, 'dhEmi');
    const natOpXML = gT(xml, 'natOp').toLowerCase();
    const nNF = gT(xml, 'nNF');
    
    // Get batch configuration
    const batchNatureza = document.getElementById('batch-natureza')?.value || 'auto';
    const batchRegime = document.getElementById('batch-regime')?.value || 'auto';
    const batchConsFinal = document.getElementById('batch-cons-final')?.value || 'auto';
    const batchContrib = document.getElementById('batch-contrib')?.value || 'auto';
    
    // Consumer Final - Use batch config or auto-detect
    let cf = batchConsFinal;
    if (cf === 'auto') {
      cf = indF === '1' ? 'sim' : 'nao';
      console.log(`[${filename}] Consumidor Final: AUTO-DETECTADO = ${cf} (XML indFinal=${indF})`);
    } else {
      console.log(`[${filename}] Consumidor Final: FORÇADO = ${cf} (XML tinha indFinal=${indF})`);
    }
    
    // Contributor - Use batch config or auto-detect
    let con = batchContrib;
    if (con === 'auto') {
      con = indIE === '9' ? 'nao' : 'sim';
      console.log(`[${filename}] Contribuinte ICMS: AUTO-DETECTADO = ${con} (XML indIEDest=${indIE})`);
    } else {
      console.log(`[${filename}] Contribuinte ICMS: FORÇADO = ${con} (XML tinha indIEDest=${indIE})`);
    }
    
    // Regime - Use batch config or auto-detect
    let reg = batchRegime;
    if (reg === 'auto') {
      reg = crt === '1' ? 'simples' : 'normal';
      console.log(`[${filename}] Regime: AUTO-DETECTADO = ${reg} (XML CRT=${crt})`);
    } else {
      console.log(`[${filename}] Regime: FORÇADO = ${reg} (XML tinha CRT=${crt})`);
    }
    
    // Natureza - Use batch config or auto-detect
    let nat = batchNatureza;
    if (nat === 'auto') {
      nat = 'venda_consumidor';
      if (natOpXML.includes('transfer')) nat = 'transferencia';
      else if (natOpXML.includes('remessa')) nat = 'remessa';
      console.log(`[${filename}] Natureza: AUTO-DETECTADA = ${nat} (XML natOp="${natOpXML}")`);
    } else {
      console.log(`[${filename}] Natureza: FORÇADA = ${nat} (XML tinha natOp="${natOpXML}")`);
    }
    
    let dt = 'Não informada';
    if (dhEmi) {
      const d = new Date(dhEmi);
      if (!isNaN(d)) dt = `${Utils.pad(d.getDate())}/${Utils.pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    }
    
    const itens = [];
    const dets = xml.getElementsByTagName('det');
    
    for (const det of dets) {
      const prod = det.getElementsByTagName('prod')[0];
      if (!prod) continue;
      
      const icms = det.getElementsByTagName('ICMS')[0];
      const desc = gT(prod, 'xProd');
      const ncm = gT(prod, 'NCM');
      const cfop = gT(prod, 'CFOP');
      
      let base = '';
      const icd = det.getElementsByTagName('ICMSDest')[0];
      if (icd) base = gT(icd, 'vBCDest') || gT(icd, 'vBC');
      if (!base && icms) base = gT(icms, 'vBC');
      if (!base) base = gT(prod, 'vProd');
      
      // Read INTERNAL aliquot (destination state)
      let aliq = '';
      if (icd) aliq = gT(icd, 'pICMSDest') || gT(icd, 'pICMS');
      if (!aliq && icms) aliq = gT(icms, 'pICMS');
      
      // Read INTERSTATE aliquot from XML (THIS IS THE FIX!)
      let aliqInter = '';
      if (icd) aliqInter = gT(icd, 'pICMSInter');
      if (!aliqInter && icms) {
        // Try to get from ICMS tags
        const icms00 = icms.getElementsByTagName('ICMS00')[0];
        const icms10 = icms.getElementsByTagName('ICMS10')[0];
        const icms20 = icms.getElementsByTagName('ICMS20')[0];
        const icms51 = icms.getElementsByTagName('ICMS51')[0];
        const icms70 = icms.getElementsByTagName('ICMS70')[0];
        const icms90 = icms.getElementsByTagName('ICMS90')[0];
        
        if (icms00) aliqInter = gT(icms00, 'pICMS');
        else if (icms10) aliqInter = gT(icms10, 'pICMS');
        else if (icms20) aliqInter = gT(icms20, 'pICMS');
        else if (icms51) aliqInter = gT(icms51, 'pICMS');
        else if (icms70) aliqInter = gT(icms70, 'pICMS');
        else if (icms90) aliqInter = gT(icms90, 'pICMS');
      }
      
      const origProd = gT(prod, 'orig') || '0';
      const importado = CONFIG.IMPORTED_ORIGINS.includes(origProd);
      
      const csosn = gT(icms || det, 'CSOSN') || gT(icms || det, 'CST') || '';
      const vST = gT(det, 'vICMSST');
      const hasST = (vST !== '' && vST !== '0') || csosn === '010' || csosn === '060';
      
      if (base && parseFloat(base) > 0) {
        // Get batch aliquot configuration
        const batchAliqInterna = document.getElementById('batch-aliq-interna')?.value || 'auto';
        const batchAliqCustom = parseFloat(document.getElementById('batch-aliq-custom')?.value) || 0;
        
        let aliqFinal = parseFloat(aliq) || 0;
        let fonte = 'XML';
        
        // Check if aliquot is forced
        if (batchAliqCustom > 0) {
          // Custom aliquot has priority
          aliqFinal = batchAliqCustom;
          fonte = 'FORÇADA (Custom)';
          console.log(`  → Alíquota FORÇADA (Custom): ${aliqFinal}% para todos os itens`);
        } else if (batchAliqInterna !== 'auto') {
          // Forced aliquot from dropdown
          aliqFinal = parseFloat(batchAliqInterna);
          fonte = 'FORÇADA';
          console.log(`  → Alíquota FORÇADA: ${aliqFinal}% para todos os itens`);
        } else {
          // Auto mode - use XML or default table
          if (!aliqFinal) {
            aliqFinal = CONFIG.ALIQ_INT[ufD] || 18;
            fonte = 'Tabela';
          } else {
            fonte = 'XML';
          }
          console.log(`  → Alíquota AUTO: ${aliqFinal}% (fonte: ${fonte})`);
        }
        
        console.log(`  → Item "${desc.substring(0, 30)}...": CFOP=${cfop}, Base=R$${parseFloat(base).toFixed(2)}, AliqInterna=${aliqFinal}%, AliqInter=${aliqInter || 'calc'}%, ST=${hasST ? 'SIM' : 'NÃO'}, Fonte=${fonte}`);
        
        itens.push({
          desc, ncm, cfop,
          base: parseFloat(base),
          aliq: aliqFinal,
          aliqInterXML: aliqInter ? parseFloat(aliqInter) : null, // Interstate aliquot from XML
          st: hasST ? 'sim' : 'nao',
          fonte, importado
        });
      }
    }
    
    const result = calcDifal({ ufO, ufD, reg, nat, cf, con, dt, itens });
    
    console.log(`✅ Resultado final para ${filename}:`, {
      ok: result.ok,
      motivo: result.mot,
      totalDIFAL: result.totG ? `R$ ${result.totG.toFixed(2)}` : 'R$ 0,00'
    });
    
    return {
      filename, nNF, ufO, ufD,
      emitNome,
      vNF: vNF ? parseFloat(vNF) : 0,
      dt,
      itemCount: itens.length,
      ...result
    };
  }
  
  // Process batch
  async function processBatch() {
    if (batchState.processing || batchState.files.length === 0) return;
    
    batchState.processing = true;
    batchState.results = [];
    
    const btn = document.getElementById('batch-process-btn');
    const lbar = document.getElementById('batch-lbar');
    
    btn.disabled = true;
    btn.textContent = 'Processando...';
    lbar.style.display = 'block';
    
    for (const fileItem of batchState.files) {
      fileItem.status = 'processing';
      renderFileList();
      
      const processed = await processFile(fileItem);
      
      if (processed.success) {
        fileItem.status = 'success';
        fileItem.result = processed.result;
        batchState.results.push(processed.result);
      } else {
        fileItem.status = 'error';
        fileItem.error = processed.error;
      }
      
      renderFileList();
    }
    
    lbar.style.display = 'none';
    btn.disabled = false;
    btn.textContent = '⚡ Processar Todos os Arquivos';
    batchState.processing = false;
    
    renderBatchResults();
  }
  
  // Render results
  function renderBatchResults() {
    const container = document.getElementById('batch-results-container');
    container.style.display = 'block';
    
    const total = batchState.results.length;
    const withDifal = batchState.results.filter(r => r.ok).length;
    const totalDifal = batchState.results.filter(r => r.ok).reduce((sum, r) => sum + (r.totG || 0), 0);
    
    // Get batch configuration labels
    const naturezaEl = document.getElementById('batch-natureza');
    const regimeEl = document.getElementById('batch-regime');
    const consFinalEl = document.getElementById('batch-cons-final');
    const contribEl = document.getElementById('batch-contrib');
    const aliqInternaEl = document.getElementById('batch-aliq-interna');
    const aliqCustomEl = document.getElementById('batch-aliq-custom');
    
    const naturezaLabel = naturezaEl?.options[naturezaEl.selectedIndex]?.text || 'Auto';
    const regimeLabel = regimeEl?.options[regimeEl.selectedIndex]?.text || 'Auto';
    const consFinalLabel = consFinalEl?.options[consFinalEl.selectedIndex]?.text || 'Auto';
    const contribLabel = contribEl?.options[contribEl.selectedIndex]?.text || 'Auto';
    const aliqInternaLabel = aliqInternaEl?.options[aliqInternaEl.selectedIndex]?.text || 'Auto';
    const aliqCustomValue = parseFloat(aliqCustomEl?.value) || 0;
    
    let aliqDisplayLabel = aliqInternaLabel;
    if (aliqCustomValue > 0) {
      aliqDisplayLabel = `${aliqCustomValue}% - Customizado`;
    }
    
    document.getElementById('batch-total-files').textContent = total;
    document.getElementById('batch-with-difal').textContent = withDifal;
    document.getElementById('batch-without-difal').textContent = total - withDifal;
    document.getElementById('batch-total-difal').textContent = `R$ ${Utils.fmt(totalDifal)}`;
    
    const resultsList = document.getElementById('batch-results-list');
    
    // Add configuration info header with export button
    const configInfo = `
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px;gap:16px">
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px;font-size:.72rem;flex:1">
          <strong style="color:var(--accent);font-size:.8rem">⚙️ Configurações Aplicadas no Lote:</strong>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-top:10px">
            <div>
              <span style="color:var(--muted)">Natureza:</span> 
              <strong>${naturezaLabel}</strong>
              ${naturezaLabel.includes('Automático') ? '<span style="color:var(--accent2);font-size:.65rem;margin-left:4px">🔄 Auto</span>' : '<span style="color:var(--accent);font-size:.65rem;margin-left:4px">🔒 Forçado</span>'}
            </div>
            <div>
              <span style="color:var(--muted)">Regime:</span> 
              <strong>${regimeLabel}</strong>
              ${regimeLabel.includes('Automático') ? '<span style="color:var(--accent2);font-size:.65rem;margin-left:4px">🔄 Auto</span>' : '<span style="color:var(--accent);font-size:.65rem;margin-left:4px">🔒 Forçado</span>'}
            </div>
            <div>
              <span style="color:var(--muted)">Consumidor Final:</span> 
              <strong>${consFinalLabel}</strong>
              ${consFinalLabel.includes('Automático') ? '<span style="color:var(--accent2);font-size:.65rem;margin-left:4px">🔄 Auto</span>' : '<span style="color:var(--accent);font-size:.65rem;margin-left:4px">🔒 Forçado</span>'}
            </div>
            <div>
              <span style="color:var(--muted)">Contribuinte ICMS:</span> 
              <strong>${contribLabel}</strong>
              ${contribLabel.includes('Automático') ? '<span style="color:var(--accent2);font-size:.65rem;margin-left:4px">🔄 Auto</span>' : '<span style="color:var(--accent);font-size:.65rem;margin-left:4px">🔒 Forçado</span>'}
            </div>
            <div style="grid-column:1/-1;margin-top:6px;padding-top:8px;border-top:1px solid var(--border)">
              <span style="color:var(--muted)">Alíquota Interna:</span> 
              <strong style="color:${aliqCustomValue > 0 || !aliqDisplayLabel.includes('Automático') ? 'var(--accent)' : 'var(--text)'}">${aliqDisplayLabel}</strong>
              ${aliqCustomValue > 0 ? '<span style="color:var(--accent);font-size:.65rem;margin-left:4px">🔒 Customizado</span>' : (aliqDisplayLabel.includes('Automático') ? '<span style="color:var(--accent2);font-size:.65rem;margin-left:4px">🔄 Auto (XML/Tabela)</span>' : '<span style="color:var(--accent);font-size:.65rem;margin-left:4px">🔒 Forçado</span>')}
            </div>
          </div>
        </div>
        <button 
          onclick="exportDifalToExcel()" 
          style="background:var(--accent2);color:#000;border:none;padding:12px 20px;border-radius:8px;cursor:pointer;font-size:.75rem;font-weight:700;display:flex;align-items:center;gap:8px;white-space:nowrap;min-width:fit-content"
        >
          📥 Exportar DIFAL
        </button>
      </div>
    `;
    
    resultsList.innerHTML = configInfo + batchState.results.map(r => {
      const hasDifal = r.ok;
      
      // Get configuration labels for this specific result
      const getNaturezaLabel = (nat) => {
        const labels = {
          'venda_consumidor': 'Venda Consumidor Final',
          'venda_revendedor': 'Venda Revendedor',
          'transferencia': 'Transferência',
          'remessa': 'Remessa'
        };
        return labels[nat] || nat;
      };
      
      const getRegimeLabel = (reg) => {
        return reg === 'simples' ? 'Simples Nacional' : 'Regime Normal';
      };
      
      const getConsFinalLabel = (cf) => {
        return cf === 'sim' ? 'Sim' : 'Não';
      };
      
      const getContribLabel = (con) => {
        return con === 'sim' ? 'Sim (contribuinte)' : 'Não (não-contribuinte)';
      };
      
      // Calculate average aliquots for this result (if has items)
      const hasItems = r.rows && r.rows.length > 0;
      const aliqInter = hasItems && r.rows[0] ? r.rows[0].aI : (r.aI || 12);
      const aliqInterna = hasItems && r.rows[0] ? r.rows[0].aliqInt : 18;
      
      return `
        <div class="batch-result-card">
          <div class="batch-result-header">
            <div class="batch-result-title">
              ${Utils.esc(r.filename)}
              ${r.nNF ? `<span style="color:var(--muted);font-size:.75rem;margin-left:8px">NF-e: ${r.nNF}</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <div class="batch-result-badge ${hasDifal ? 'yes' : 'no'}">
                ${hasDifal ? '⚠ COM DIFAL' : '✓ SEM DIFAL'}
              </div>
              ${r.rows && r.rows.length > 0 ? `
                <button 
                  onclick="toggleDetails('${Utils.esc(r.filename).replace(/'/g, "\\'")}')" 
                  style="background:var(--accent);color:#000;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:.7rem;font-weight:700;display:flex;align-items:center;gap:4px"
                >
                  <span id="arrow-${Utils.esc(r.filename).replace(/[^a-zA-Z0-9]/g, '_')}">▼</span>
                  Detalhes dos Produtos
                </button>
              ` : ''}
            </div>
          </div>
          <div class="batch-result-info">
            <div class="batch-result-info-item">
              <div class="batch-result-info-label">Origem → Destino</div>
              <div class="batch-result-info-value">${r.ufO} → ${r.ufD}</div>
            </div>
            <div class="batch-result-info-item">
              <div class="batch-result-info-label">Alíq. Interestadual</div>
              <div class="batch-result-info-value" style="color:var(--blue);font-weight:700">${aliqInter}%</div>
            </div>
            <div class="batch-result-info-item">
              <div class="batch-result-info-label">Alíq. Interna Destino</div>
              <div class="batch-result-info-value" style="color:var(--accent2);font-weight:700">${typeof aliqInterna === 'number' ? aliqInterna.toFixed(2) : aliqInterna}%</div>
            </div>
            <div class="batch-result-info-item">
              <div class="batch-result-info-label">Diferencial</div>
              <div class="batch-result-info-value" style="color:${hasDifal ? 'var(--accent)' : 'var(--muted)'};font-weight:700">
                ${typeof aliqInterna === 'number' && typeof aliqInter === 'number' ? (aliqInterna - aliqInter).toFixed(2) : '0.00'}%
              </div>
            </div>
            <div class="batch-result-info-item">
              <div class="batch-result-info-label">Natureza</div>
              <div class="batch-result-info-value" style="font-size:.68rem">${getNaturezaLabel(r.p?.nat || '')}</div>
            </div>
            <div class="batch-result-info-item">
              <div class="batch-result-info-label">Regime</div>
              <div class="batch-result-info-value" style="font-size:.68rem">${getRegimeLabel(r.p?.reg || '')}</div>
            </div>
            <div class="batch-result-info-item">
              <div class="batch-result-info-label">Cons. Final?</div>
              <div class="batch-result-info-value" style="font-size:.68rem">${getConsFinalLabel(r.p?.cf || '')}</div>
            </div>
            <div class="batch-result-info-item">
              <div class="batch-result-info-label">Contrib. ICMS?</div>
              <div class="batch-result-info-value" style="font-size:.68rem">${getContribLabel(r.p?.con || '')}</div>
            </div>
            <div class="batch-result-info-item">
              <div class="batch-result-info-label">Valor da NF</div>
              <div class="batch-result-info-value">R$ ${Utils.fmt(r.vNF || 0)}</div>
            </div>
            <div class="batch-result-info-item">
              <div class="batch-result-info-label">Itens</div>
              <div class="batch-result-info-value">${r.itemCount || 0}</div>
            </div>
            <div class="batch-result-info-item">
              <div class="batch-result-info-label">Data</div>
              <div class="batch-result-info-value">${r.dt}</div>
            </div>
            ${hasDifal ? `
              <div class="batch-result-info-item">
                <div class="batch-result-info-label">DIFAL</div>
                <div class="batch-result-info-value highlight">R$ ${Utils.fmt(r.totD || 0)}</div>
              </div>
              <div class="batch-result-info-item">
                <div class="batch-result-info-label">Total a Recolher</div>
                <div class="batch-result-info-value highlight">R$ ${Utils.fmt(r.totG || 0)}</div>
              </div>
            ` : `
              <div class="batch-result-info-item" style="grid-column:1/-1">
                <div class="batch-result-info-label">Motivo</div>
                <div class="batch-result-info-value">${r.mot || 'Sem DIFAL'}</div>
              </div>
            `}
          </div>
          
          ${r.rows && r.rows.length > 0 ? `
            <div id="details-${Utils.esc(r.filename).replace(/[^a-zA-Z0-9]/g, '_')}" style="display:none;margin-top:16px;border-top:1px solid var(--border);padding-top:16px">
              <div style="font-weight:700;font-size:.75rem;color:var(--accent);margin-bottom:12px">📦 Produtos Individuais (${r.rows.length})</div>
              <div style="overflow-x:auto">
                <table style="width:100%;border-collapse:collapse;font-size:.7rem">
                  <thead>
                    <tr style="background:var(--surface2);text-align:left">
                      <th style="padding:8px;border:1px solid var(--border)">Produto</th>
                      <th style="padding:8px;border:1px solid var(--border)">NCM</th>
                      <th style="padding:8px;border:1px solid var(--border)">CFOP</th>
                      <th style="padding:8px;border:1px solid var(--border)">Base Cálculo</th>
                      <th style="padding:8px;border:1px solid var(--border)">Alíq. Inter (%)</th>
                      <th style="padding:8px;border:1px solid var(--border)">Alíq. Interna (%)</th>
                      <th style="padding:8px;border:1px solid var(--border)">Diferencial (%)</th>
                      <th style="padding:8px;border:1px solid var(--border)">DIFAL</th>
                      <th style="padding:8px;border:1px solid var(--border)">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${r.rows.map(item => `
                      <tr>
                        <td style="padding:8px;border:1px solid var(--border);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Utils.esc(item.desc || '-')}</td>
                        <td style="padding:8px;border:1px solid var(--border)">${item.ncm || '-'}</td>
                        <td style="padding:8px;border:1px solid var(--border);font-weight:600">${item.cfop || '-'}</td>
                        <td style="padding:8px;border:1px solid var(--border)">R$ ${Utils.fmt(item.base || 0)}</td>
                        <td style="padding:8px;border:1px solid var(--border);color:var(--blue);font-weight:700">${(item.aI || 0).toFixed(2)}%</td>
                        <td style="padding:8px;border:1px solid var(--border);color:var(--accent2);font-weight:700">${(item.aliqInt || item.aliq || 0).toFixed(2)}%</td>
                        <td style="padding:8px;border:1px solid var(--border);color:${item.vD > 0 ? 'var(--accent)' : 'var(--muted)'};font-weight:700">${(item.pct || 0).toFixed(2)}%</td>
                        <td style="padding:8px;border:1px solid var(--border);font-weight:700;color:${item.vD > 0 ? 'var(--accent)' : 'var(--muted)'}">R$ ${Utils.fmt(item.vD || 0)}</td>
                        <td style="padding:8px;border:1px solid var(--border);font-size:.65rem;color:${item.mot ? 'var(--muted)' : 'var(--green)'}">${item.mot || 'DIFAL calculado'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
    
    container.scrollIntoView({ behavior: 'smooth' });
  }
  
  function resetBatch() {
    batchState.files = [];
    batchState.results = [];
    
    document.getElementById('batch-files-list').innerHTML = '';
    document.getElementById('batch-upf').textContent = '';
    document.getElementById('batch-process-btn').style.display = 'none';
    document.getElementById('batch-results-container').style.display = 'none';
    document.getElementById('batch-xml-files').value = '';
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  
  // Init
  function init() {
    document.getElementById('tab-btn-single')?.addEventListener('click', () => switchTab('single'));
    document.getElementById('tab-btn-batch')?.addEventListener('click', () => switchTab('batch'));
    document.getElementById('batch-xml-files')?.addEventListener('change', handleBatchFiles);
    document.getElementById('batch-process-btn')?.addEventListener('click', processBatch);
    document.getElementById('batch-reset-btn')?.addEventListener('click', resetBatch);
    
    const batchUpz = document.getElementById('batch-upz');
    if (batchUpz) {
      batchUpz.addEventListener('dragover', e => { e.preventDefault(); batchUpz.classList.add('over'); });
      batchUpz.addEventListener('dragleave', () => batchUpz.classList.remove('over'));
      batchUpz.addEventListener('drop', e => {
        e.preventDefault();
        batchUpz.classList.remove('over');
        const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.xml'));
        if (files.length > 0) {
          const dt = new DataTransfer();
          files.forEach(f => dt.items.add(f));
          document.getElementById('batch-xml-files').files = dt.files;
          handleBatchFiles({ target: { files: dt.files } });
        }
      });
    }
    
    console.log('✅ Batch processor OK!');
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Toggle details function for product breakdown
  window.toggleDetails = function(filename) {
    const safeId = filename.replace(/[^a-zA-Z0-9]/g, '_');
    const detailsEl = document.getElementById(`details-${safeId}`);
    const arrowEl = document.getElementById(`arrow-${safeId}`);
    
    if (detailsEl && arrowEl) {
      if (detailsEl.style.display === 'none') {
        detailsEl.style.display = 'block';
        arrowEl.textContent = '▲';
      } else {
        detailsEl.style.display = 'none';
        arrowEl.textContent = '▼';
      }
    }
  };
  
  // Export DIFAL results to Excel
  window.exportDifalToExcel = function() {
    // Filter only results with DIFAL
    const resultsWithDifal = batchState.results.filter(r => r.ok && r.totG > 0);
    
    if (resultsWithDifal.length === 0) {
      alert('Não há notas com DIFAL para exportar!');
      return;
    }
    
    // Create CSV content
    let csv = '\uFEFF'; // UTF-8 BOM for Excel
    csv += 'Emitente,Data Emissão,Número da Nota,Valor Total da Nota,Valor do DIFAL\n';
    
    resultsWithDifal.forEach(r => {
      const emitente = r.emitNome || 'Não informado';
      const data = r.dt || 'Não informada';
      const numeroNota = r.nNF || 'Não informado';
      const valorNota = `R$ ${Utils.fmt(r.vNF || 0)}`;
      const valorDifal = `R$ ${Utils.fmt(r.totG || 0)}`;
      
      // Escape commas and quotes in CSV
      const escapeCsv = (str) => {
        str = String(str).replace(/"/g, '""');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str}"`;
        }
        return str;
      };
      
      csv += `${escapeCsv(emitente)},${escapeCsv(data)},${escapeCsv(numeroNota)},${escapeCsv(valorNota)},${escapeCsv(valorDifal)}\n`;
    });
    
    // Add summary row
    const totalDifal = resultsWithDifal.reduce((sum, r) => sum + (r.totG || 0), 0);
    csv += `\n,,,TOTAL DIFAL,R$ ${Utils.fmt(totalDifal)}`;
    
    // Create download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, '0')}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getFullYear()}`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', `DIFAL_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log(`✅ Exportados ${resultsWithDifal.length} notas com DIFAL`);
  };
  
})();
