// URL fornecida pelo Google Apps Script (Deixe em branco se for usar apenas local)
const GOOGLE_SHEETS_URL = "https://script.google.com/macros/s/AKfycbzTM-fZd6FlB0JMXd-5u9uZx8OjyAZba6I4tpaXuBGCzL0RJFt37P3BEuP3mhZJRM3Y6w/exec";

let bancoOS = JSON.parse(localStorage.getItem('bancoOS')) || [];
let osAtual = {};
let canvas, ctx, isDrawing = false;

document.addEventListener("DOMContentLoaded", () => {
    initSignaturePad();
    atualizarDashboard();
    renderHistorico();
});

// Alternar entre abas do menu
function showSection(sectionId) {
    document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
}

// Inicializa formulário para nova O.S. com numeração única automática
function novaOS() {
    document.getElementById('os-form').reset();
    document.getElementById('prev-horimetro').style.display = 'none';
    document.getElementById('prev-antes').style.display = 'none';
    document.getElementById('prev-depois').style.display = 'none';
    document.getElementById('signature-preview').style.display = 'none';
    document.getElementById('signature-status').innerText = "❌ Assinatura não coletada";
    
    // Gera o código único de O.S. sequencial/aleatório
    const novoNumero = "OS-" + Math.floor(100000 + Math.random() * 900000);
    document.getElementById('txt-numero-os').innerText = novoNumero;
    
    osAtual = { numero: novoNumero, assinatura: null };
    showSection('form-section');
}

// Converte uploads de imagens para visualização e salvamento em Base64
function previewImg(input, elementId) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById(elementId);
            img.src = e.target.result;
            img.style.display = 'block';
        }
        reader.readAsDataURL(file);
    }
}

// CONFIGURAÇÃO DO CANVAS DE ASSINATURA
function initSignaturePad() {
    canvas = document.getElementById('signature-pad');
    ctx = canvas.getContext('2d');
    
    // Eventos do Mouse
    canvas.addEventListener('mousedown', (e) => { isDrawing = true; draw(e.offsetX, e.offsetY); });
    canvas.addEventListener('mousemove', (e) => { if(isDrawing) draw(e.offsetX, e.offsetY); });
    window.addEventListener('mouseup', () => isDrawing = false);

    // Eventos de Toque (Mobile - Uso em campo)
    canvas.addEventListener('touchstart', (e) => {
        isDrawing = true;
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        draw(touch.clientX - rect.left, touch.clientY - rect.top);
    });
    canvas.addEventListener('touchmove', (e) => {
        if(!isDrawing) return;
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        draw(touch.clientX - rect.left, touch.clientY - rect.top);
    });
    canvas.addEventListener('touchend', () => isDrawing = false);
}

function draw(x, y) {
    if(!isDrawing) return;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000000';
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
}

function openSignatureModal() { document.getElementById('signature-modal').style.display = 'flex'; }
function closeSignatureModal() { document.getElementById('signature-modal').style.display = 'none'; }
function clearSignature() { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.beginPath(); }

function saveSignature() {
    const dataURL = canvas.toDataURL();
    osAtual.assinatura = dataURL;
    const imgPrev = document.getElementById('signature-preview');
    imgPrev.src = dataURL;
    imgPrev.style.display = 'block';
    document.getElementById('signature-status').innerText = "✅ Assinatura Coletada";
    closeSignatureModal();
}

// SALVAR O.S. NO HISTÓRICO
function salvarOS() {
    const numOS = document.getElementById('txt-numero-os').innerText;
    
    const dadosForm = {
        numero: numOS,
        tecnico: document.getElementById('tecnico').value,
        status: document.getElementById('status-os').value,
        cliente: document.getElementById('cliente-select').value,
        documento: document.getElementById('doc-responsavel').value,
        data: document.getElementById('data-atendimento').value,
        modelo: document.getElementById('modelo-empilhadeira').value,
        horimetro: document.getElementById('valor-horimetro').value,
        descricao: document.getElementById('descricao-servico').value,
        pecas: document.getElementById('pecas-aplicadas').value,
        fotoHorimetro: document.getElementById('prev-horimetro').src,
        fotoAntes: document.getElementById('prev-antes').src,
        fotoDepois: document.getElementById('prev-depois').src,
        assinatura: osAtual.assinatura,
        arquivado: false
    };

    if(!dadosForm.tecnico || !dadosForm.cliente || !dadosForm.horimetro) {
        alert("Por favor, preencha os campos obrigatórios marcados com (*)");
        return;
    }

    const index = bancoOS.findIndex(item => item.numero === numOS);
    if(index > -1) {
        bancoOS[index] = dadosForm; // Atualiza se for edição
    } else {
        bancoOS.push(dadosForm); // Adiciona nova O.S.
    }

    localStorage.setItem('bancoOS', JSON.stringify(bancoOS));
    
    // Dispara em background para o Google Sheets (se configurado)
    enviarParaGoogleSheets(dadosForm);

    alert("Ordem de Serviço registrada com sucesso!");
    atualizarDashboard();
    renderHistorico();
    showSection('historico-section');
}

function enviarParaGoogleSheets(dados) {
    if(!GOOGLE_SHEETS_URL || GOOGLE_SHEETS_URL.includes("SUA_URL")) return;
    fetch(GOOGLE_SHEETS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
    }).catch(err => console.log("Aviso Sheets:", err));
}

// ATUALIZAR MÉTRICAS DO PAINEL / DASHBOARD
function atualizarDashboard() {
    const ativas = bancoOS.filter(o => !o.arquivado);
    document.getElementById('dash-total').innerText = ativas.length;
    document.getElementById('dash-agendadas').innerText = ativas.filter(o => o.status === 'Agendado').length;
    document.getElementById('dash-concluidas').innerText = ativas.filter(o => o.status === 'Concluído').length;

    const tbodyAgendados = document.querySelector('#table-agendados tbody');
    tbodyAgendados.innerHTML = "";
    bancoOS.filter(o => o.status === 'Agendado' && !o.arquivado).forEach(o => {
        tbodyAgendados.innerHTML += `
            <tr>
                <td>${o.numero}</td>
                <td>${o.cliente}</td>
                <td>${o.data ? new Date(o.data).toLocaleString('pt-BR') : 'Sem data'}</td>
                <td><button class="btn btn-orange" onclick="editarOS('${o.numero}')">Atender</button></td>
            </tr>
        `;
    });
}

// EXIBIR HISTÓRICO
function renderHistorico() {
    const tbody = document.getElementById('historico-corpo');
    tbody.innerHTML = "";

    bancoOS.forEach(o => {
        if(o.arquivado) return;
        tbody.innerHTML += `
            <tr>
                <td><b>${o.numero}</b></td>
                <td>${o.cliente}</td>
                <td>${o.tecnico}</td>
                <td><span class="badge status-${o.status.toLowerCase().replace(" ", "-")}">${o.status}</span></td>
                <td>
                    <button class="btn btn-orange" onclick="editarOS('${o.numero}')" title="Editar"><i class="fa-solid fa-edit"></i></button>
                    <button class="btn btn-blue" onclick="gerarPDF('${o.numero}')" title="Gerar PDF"><i class="fa-solid fa-file-pdf"></i></button>
                    <button class="btn btn-gray" onclick="arquivarOS('${o.numero}')" title="Arquivar"><i class="fa-solid fa-box-archive"></i></button>
                </td>
            </tr>
        `;
    });
}

// CONFIGURAR FORMULÁRIO COM DADOS DA O.S. SELECIONADA PARA EDIÇÃO
function editarOS(numero) {
    const os = bancoOS.find(o => o.numero === numero);
    if(!os) return;

    novaOS();
    document.getElementById('txt-numero-os').innerText = os.numero;
    document.getElementById('tecnico').value = os.tecnico;
    document.getElementById('status-os').value = os.status;
    document.getElementById('cliente-select').value = os.cliente;
    document.getElementById('doc-responsavel').value = os.documento;
    document.getElementById('data-atendimento').value = os.data;
    document.getElementById('modelo-empilhadeira').value = os.modelo;
    document.getElementById('valor-horimetro').value = os.horimetro;
    document.getElementById('descricao-servico').value = os.descricao;
    document.getElementById('pecas-aplicadas').value = os.pecas;

    if(os.fotoHorimetro && os.fotoHorimetro.startsWith("data:")) {
        document.getElementById('prev-horimetro').src = os.fotoHorimetro;
        document.getElementById('prev-horimetro').style.display = 'block';
    }
    if(os.fotoAntes && os.fotoAntes.startsWith("data:")) {
        document.getElementById('prev-antes').src = os.fotoAntes;
        document.getElementById('prev-antes').style.display = 'block';
    }
    if(os.fotoDepois && os.fotoDepois.startsWith("data:")) {
        document.getElementById('prev-depois').src = os.fotoDepois;
        document.getElementById('prev-depois').style.display = 'block';
    }
    if(os.assinatura) {
        osAtual.assinatura = os.assinatura;
        document.getElementById('signature-preview').src = os.assinatura;
        document.getElementById('signature-preview').style.display = 'block';
        document.getElementById('signature-status').innerText = "✅ Assinatura Presente";
    }
    showSection('form-section');
}

function arquivarOS(numero) {
    if(confirm(`Deseja arquivar e ocultar a ${numero}?`)) {
        const os = bancoOS.find(o => o.numero === numero);
        if(os) os.arquivado = true;
        localStorage.setItem('bancoOS', JSON.stringify(bancoOS));
        atualizarDashboard();
        renderHistorico();
    }
}

// GERAÇÃO DE PDF ESTRUTURADO PROFISSIONAL
function gerarPDF(numero) {
    const os = bancoOS.find(o => o.numero === numero);
    if(!os) return;

    const template = document.getElementById('pdf-template');
    template.style.display = 'block';

    template.innerHTML = `
        <div style="padding: 25px; font-family: Arial, sans-serif; color: #333;">
            <div style="display: flex; justify-content: space-between; border-bottom: 3px solid #f39c12; padding-bottom: 10px; margin-bottom: 20px;">
                <h2 style="margin:0;">RELATÓRIO DE MANUTENÇÃO EM CAMPO</h2>
                <h2 style="color: #f39c12; margin:0;">${os.numero}</h2>
            </div>
            
            <table style="width:100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr style="background:#2c3e50; color:white;"><th colspan="2" style="padding: 8px;">DADOS GERAIS</th></tr>
                <tr><td style="padding:8px; border:1px solid #ddd;"><b>Cliente:</b> ${os.cliente}</td><td style="padding:8px; border:1px solid #ddd;"><b>Doc. Responsável:</b> ${os.documento}</td></tr>
                <tr><td style="padding:8px; border:1px solid #ddd;"><b>Técnico:</b> ${os.tecnico}</td><td style="padding:8px; border:1px solid #ddd;"><b>Data/Hora Atendimento:</b> ${os.data ? new Date(os.data).toLocaleString('pt-BR') : 'N/A'}</td></tr>
                <tr><td style="padding:8px; border:1px solid #ddd;"><b>Equipamento:</b> ${os.modelo}</td><td style="padding:8px; border:1px solid #ddd;"><b>Horímetro:</b> ${os.horimetro} Horas</td></tr>
            </table>

            <div style="margin-bottom: 20px;">
                <h4 style="border-bottom: 1px solid #2c3e50; padding-bottom: 4px; margin-bottom: 8px;">SERVIÇOS EXECUTADOS</h4>
                <p style="background: #fcfcfc; padding: 10px; border: 1px solid #eee; font-size: 14px; white-space: pre-wrap;">${os.descricao || 'Sem descrição cadastrada.'}</p>
            </div>

            <div style="margin-bottom: 20px;">
                <h4 style="border-bottom: 1px solid #2c3e50; padding-bottom: 4px; margin-bottom: 8px;">PEÇAS E INSUMOS APLICADOS</h4>
                <p style="background: #fcfcfc; padding: 10px; border: 1px solid #eee; font-size: 14px; white-space: pre-wrap;">${os.pecas || 'Nenhuma peça aplicada.'}</p>
            </div>

            <div style="margin-bottom: 30px; page-break-inside: avoid;">
                <h4 style="border-bottom: 1px solid #2c3e50; padding-bottom: 4px; margin-bottom: 12px;">EVIDÊNCIAS FOTOGRÁFICAS</h4>
                <div style="display: flex; gap: 10px; justify-content: flex-start;">
                    ${os.fotoHorimetro && os.fotoHorimetro.startsWith("data:") ? `<div><p style="font-size:11px; margin:0 0 4px 0; text-align:center;"><b>Horímetro</b></p><img src="${os.fotoHorimetro}" style="width:160px; height:120px; object-fit:cover; border:1px solid #ccc; border-radius:4px;"></div>` : ''}
                    ${os.fotoAntes && os.fotoAntes.startsWith("data:") ? `<div><p style="font-size:11px; margin:0 0 4px 0; text-align:center;"><b>Antes / Defeito</b></p><img src="${os.fotoAntes}" style="width:160px; height:120px; object-fit:cover; border:1px solid #ccc; border-radius:4px;"></div>` : ''}
                    ${os.fotoDepois && os.fotoDepois.startsWith("data:") ? `<div><p style="font-size:11px; margin:0 0 4px 0; text-align:center;"><b>Depois / Reparo</b></p><img src="${os.fotoDepois}" style="width:160px; height:120px; object-fit:cover; border:1px solid #ccc; border-radius:4px;"></div>` : ''}
                </div>
            </div>

            <div style="margin-top: 50px; text-align: center; page-break-inside: avoid;">
                <p style="font-size: 14px; margin-bottom: 5px;"><b>Assinatura de Conformidade do Cliente</b></p>
                ${os.assinatura ? `<img src="${os.assinatura}" style="width: 200px; border-bottom: 1px solid #333; padding-bottom: 2px;">` : '<p style="color:red; font-weight:bold;">O.S. NÃO ASSINADA PELO CLIENTE</p>'}
                <p style="font-size: 11px; color:#555; margin-top:4px;">Responsável: ${os.cliente} | Doc: ${os.documento}</p>
            </div>
        </div>
    `;

    const opt = {
        margin: 10,
        filename: `Ordem_Servico_${os.numero}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(template).save().then(() => {
        template.style.display = 'none'; // Limpa a tela após gerar
    });
}
