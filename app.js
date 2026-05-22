// URL da API do seu Google Apps Script Web App (Coloque seu link aqui após configurar)
const GOOGLE_SHEETS_URL = "https://script.google.com/macros/s/AKfycbzTM-fZd6FlB0JMXd-5u9uZx8OjyAZba6I4tpaXuBGCzL0RJFt37P3BEuP3mhZJRM3Y6w/exec";

let bancoOS = JSON.parse(localStorage.getItem('bancoOS')) || [];
let osAtual = {};
let canvas, ctx, isDrawing = false;

document.addEventListener("DOMContentLoaded", () => {
    initSignaturePad();
    atualizarDashboard();
    renderHistorico();
});

// Navegação entre seções
function showSection(sectionId) {
    document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
}

// Inicia nova OS com gerador numérico sequencial baseado em data/timestamp simplificado
function novaOS() {
    document.getElementById('os-form').reset();
    document.getElementById('prev-horimetro').style.display = 'none';
    document.getElementById('prev-antes').style.display = 'none';
    document.getElementById('prev-depois').style.display = 'none';
    document.getElementById('signature-preview').style.display = 'none';
    document.getElementById('signature-status').innerText = "❌ Assinatura não coletada";
    
    // Geração automática do número da O.S.
    const novoNumero = "OS-" + Math.floor(100000 + Math.random() * 900000);
    document.getElementById('txt-numero-os').innerText = novoNumero;
    
    osAtual = { numero: novoNumero, assinatura: null };
    showSection('form-section');
}

// Pré-visualização de Imagens em Base64
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

// LÓGICA DO CANVAS (PAD DE ASSINATURA)
function initSignaturePad() {
    canvas = document.getElementById('signature-pad');
    ctx = canvas.getContext('2d');
    
    // Eventos Mouse
    canvas.addEventListener('mousedown', (e) => { isDrawing = true; draw(e.offsetX, e.offsetY); });
    canvas.addEventListener('mousemove', (e) => { if(isDrawing) draw(e.offsetX, e.offsetY); });
    window.addEventListener('mouseup', () => isDrawing = false);

    // Eventos Touch (Celular em campo)
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
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
    if(!isDrawing) return;
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
    document.getElementById('signature-preview').src = dataURL;
    document.getElementById('signature-preview').style.display = 'block';
    document.getElementById('signature-status').innerText = "✅ Assinatura Salva com Sucesso";
    closeSignatureModal();
}

// SALVAR O.S. NO LOCALSTORAGE E DISPARAR PARA O GOOGLE SHEETS
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
        alert("Por favor, preencha todos os campos obrigatórios (*)");
        return;
    }

    // Verifica se é edição ou nova O.S.
    const index = bancoOS.findIndex(item => item.numero === numOS);
    if(index > -1) {
        bancoOS[index] = dadosForm; // Atualiza
    } else {
        bancoOS.push(dadosForm); // Cria nova
    }

    localStorage.setItem('bancoOS', JSON.stringify(bancoOS));
    
    // Integração Assíncrona com Planilha Google Sheets
    enviarParaGoogleSheets(dadosForm);

    alert("O.S. salva com sucesso!");
    atualizarDashboard();
    renderHistorico();
    showSection('historico-section');
}

// ENVIAR DADOS PARA O GOOGLE SHEETS
function enviarParaGoogleSheets(dados) {
    if(GOOGLE_SHEETS_URL.includes("SUA_URL")) return; // Não envia se não configurado

    fetch(GOOGLE_SHEETS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
    }).then(() => console.log("Dados enviados para planilha com sucesso!"))
      .catch(err => console.error("Erro ao enviar dados para a Planilha:", err));
}

// ATUALIZAR DASHBOARD INTERATIVO
function atualizarDashboard() {
    const ativas = bancoOS.filter(o => !o.arquivado);
    document.getElementById('dash-total').innerText = ativas.length;
    document.getElementById('dash-agendadas').innerText = ativas.filter(o => o.status === 'Agendado').length;
    document.getElementById('dash-concluidas').innerText = ativas.filter(o => o.status === 'Concluído').length;

    // Tabela de agendamentos próximos
    const tbodyAgendados = document.querySelector('#table-agendados tbody');
    tbodyAgendados.innerHTML = "";
    bancoOS.filter(o => o.status === 'Agendado' && !o.arquivado).forEach(o => {
        tbodyAgendados.innerHTML += `
            <tr>
                <td>${o.numero}</td>
                <td>${o.cliente}</td>
                <td>${o.data ? new Date(o.data).toLocaleString('pt-BR') : 'Não informada'}</td>
                <td><button class="btn btn-orange" onclick="editarOS('${o.numero}')">Atender</button></td>
            </tr>
        `;
    });
}

// RENDERIZAR TABELA DE HISTÓRICO
function renderHistorico() {
    const tbody = document.getElementById('historico-corpo');
    tbody.innerHTML = "";

    bancoOS.forEach(o => {
        if(o.arquivado) return; // Esconde se estiver arquivada

        tbody.innerHTML += `
            <tr>
                <td><b>${o.numero}</b></td>
                <td>${o.cliente}</td>
                <td>${o.tecnico}</td>
                <td><span class="badge status-${o.status.toLowerCase().replace(" ", "-")}">${o.status}</span></td>
                <td>
                    <button class="btn btn-orange" onclick="editarOS('${o.numero}')" title="Editar"><i class="fa-solid fa-edit"></i></button>
                    <button class="btn btn-blue" onclick="gerarPDF('${o.numero}')" title="Ver O.S / PDF"><i class="fa-solid fa-file-pdf"></i></button>
                    <button class="btn btn-gray" onclick="arquivarOS('${o.numero}')" title="Arquivar"><i class="fa-solid fa-box-archive"></i></button>
                </td>
            </tr>
        `;
    });
}

// OPERAÇÕES DO HISTÓRICO
function editarOS(numero) {
    const os = bancoOS.find(o => o.numero === numero);
    if(!os) return;

    novaOS(); // Limpa e prepara
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

    if(os.fotoHorimetro && os.fotoHorimetro !== "#") {
        document.getElementById('prev-horimetro').src = os.fotoHorimetro;
        document.getElementById('prev-horimetro').style.display = 'block';
    }
    if(os.fotoAntes && os.fotoAntes !== "#") {
        document.getElementById('prev-antes').src = os.fotoAntes;
        document.getElementById('prev-antes').style.display = 'block';
    }
    if(os.fotoDepois && os.fotoDepois !== "#") {
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
    if(confirm(`Deseja realmente arquivar a O.S. ${numero}?`)) {
        const os = bancoOS.find(o => o.numero === numero);
        if(os) os.arquivado = true;
        localStorage.setItem('bancoOS', JSON.stringify(bancoOS));
        atualizarDashboard();
        renderHistorico();
    }
}

// GERADOR DE PDF PROFISSIONAL COM LAYOUT DE RELATÓRIO TÉCNICO
function gerarPDF(numero) {
    const os = bancoOS.find(o => o.numero === numero);
    if(!os) return;

    const template = document.getElementById('pdf-template');
    template.style.display = 'block';

    template.innerHTML = `
        <div style="padding: 30px; font-family: Arial, sans-serif; color: #333;">
            <div style="display: flex; justify-content: space-between; border-bottom: 3px solid #e67e22; padding-bottom: 10px;">
                <h2>RELATÓRIO TÉCNICO DE MANUTENÇÃO DE EMPILHADEIRAS</h2>
                <h2 style="color: #e67e22;">Nº ${os.numero}</h2>
            </div>
            
            <table style="width:100%; margin-top:20px; border: 1px solid #ddd;">
                <tr style="background:#f2f2f2;"><th colspan="2" style="color:#2c3e50; text-align:left;">DADOS DO ATENDIMENTO</th></tr>
                <tr><td><b>Cliente:</b> ${os.cliente}</td><td><b>Documento/RG/CPF:</b> ${os.documento}</td></tr>
                <tr><td><b>Técnico Responsável:</b> ${os.tecnico}</td><td><b>Data/Hora:</b> ${os.data ? new Date(os.data).toLocaleString('pt-BR') : 'N/A'}</td></tr>
                <tr><td><b>Status Final:</b> ${os.status}</td><td><b>Equipamento:</b> ${os.modelo}</td></tr>
                <tr><td colspan="2"><b>Horímetro Registrado:</b> ${os.horimetro} hrs</td></tr>
            </table>

            <div style="margin-top:20px;">
                <h3>Descrição do Serviço Efetuado:</h3>
                <p style="background: #fafafa; padding:10px; border: 1px solid #eee; border-radius:4px;">${os.descricao || 'Nenhuma descrição fornecida.'}</p>
            </div>

            <div style="margin-top:20px;">
                <h3>Peças e Insumos Aplicados:</h3>
                <p style="background: #fafafa; padding:10px; border: 1px solid #eee; border-radius:4px;">${os.pecas || 'Nenhuma peça aplicada.'}</p>
            </div>

            <div style="margin-top:25px; page-break-inside: avoid;">
                <h3>Evidências Fotográficas</h3>
                <div style="display: flex; gap: 15px; margin-top: 10px;">
                    <div>
                        <p><b>Leitura do Horímetro:</b></p>
                        <img src="${os.fotoHorimetro}" style="max-width: 200px; max-height:150px; border:1px solid #ccc; border-radius:4px;">
                    </div>
                    <div>
                        <p><b>Antes/Problema:</b></p>
                        <img src="${os.fotoAntes}" style="max-width: 200px; max-height:150px; border:1px solid #ccc; border-radius:4px;">
                    </div>
                    <div>
                        <p><b>Depois/Solução:</b></p>
                        <img src="${os.fotoDepois}" style="max-width: 200px; max-height:150px; border:1px solid #ccc; border-radius:4px;">
                    </div>
                </div>
            </div>

            <div style="margin-top: 40px; text-align: center; page-break-inside: avoid;">
                <p><b>Assinatura de Confirmação do Cliente:</b></p>
                ${os.assinatura ? `<img src="${os.assinatura}" style="border-bottom: 1px solid #000; padding: 5px; width: 220px;">` : '<p style="color:red;">Não assinada digitalmente</p>'}
                <p style="font-size: 12px; margin-top:5px;">Responsável: ${os.cliente} | Doc: ${os.documento}</p>
            </div>
        </div>
    `;

    const opcoes = {
        margin: 10,
        filename: `Ordem_Servico_${os.numero}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opcoes).from(template).save().then(() => {
        template.style.display = 'none'; // Oculta o template pós impressão
    });
}
