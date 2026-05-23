# 🔧 MARLIFT SERVICE OS

> Sistema PWA de Ordem de Serviço para Manutenção de Empilhadeiras

---

## 🚀 Como publicar no GitHub Pages (passo a passo)

### 1. Criar repositório no GitHub
1. Acesse [github.com/new](https://github.com/new)
2. Nome sugerido: `marlift-service-os`
3. Deixe como **público**
4. Clique em **Create repository**

### 2. Fazer upload dos arquivos
Você tem duas opções:

#### Opção A — Upload direto pelo navegador (mais fácil)
1. No repositório criado, clique em **"uploading an existing file"**
2. Arraste **todos os arquivos e a pasta `icons/`** para a área de upload
3. Clique em **Commit changes**

#### Opção B — Via Git (terminal)
```bash
git init
git add .
git commit -m "MARLIFT SERVICE OS v3.0"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/marlift-service-os.git
git push -u origin main
```

### 3. Ativar GitHub Pages
1. Vá em **Settings** → **Pages**
2. Em **Source**, selecione: `Deploy from a branch`
3. Branch: `main` / Pasta: `/ (root)`
4. Clique em **Save**
5. Aguarde ~2 minutos e acesse a URL gerada:
   ```
   https://SEU_USUARIO.github.io/marlift-service-os/
   ```

---

## 📁 Estrutura dos Arquivos

```
marlift-service-os/
├── index.html        ← Aplicação principal
├── script.js         ← Toda a lógica do sistema
├── style.css         ← Estilos e tema visual
├── sw.js             ← Service Worker (modo offline)
├── manifest.json     ← Configuração PWA (ícone, nome)
└── icons/            ← Ícones para instalação no celular
    ├── icon-72.png
    ├── icon-96.png
    ├── icon-128.png
    ├── icon-144.png
    ├── icon-152.png
    ├── icon-192.png
    ├── icon-384.png
    └── icon-512.png
```

---

## ✅ Funcionalidades do Sistema

| Funcionalidade | Descrição |
|---|---|
| 🔐 Login com PIN | Senha padrão: `123456` |
| 📊 Dashboard Interativo | Cards clicáveis com listas filtradas de OS |
| 📋 Nova OS | Formulário completo com 6 seções |
| ⏱️ Cronômetro | Registro completo de tempo com log de pausas |
| 📷 Fotos | Até 40 fotos de evidência + foto do horímetro |
| ✍️ Assinatura Digital | Canvas para assinatura do cliente |
| 📅 Agenda | Calendário mensal interativo com OS agendadas |
| 📂 Histórico | Busca e filtro em todas as OS salvas |
| 👥 Clientes | Cadastro e **edição** de clientes e equipamentos |
| 📄 PDF Completo | Gera PDF com todas as fotos, logs e assinatura |
| ☁️ Google Sheets | Sincronização com planilha + **fila offline** |
| 📲 PWA Instalável | Instala como app nativo com ícone personalizado |
| 🔌 Modo Offline | Funciona 100% sem internet |

---

## 📱 Instalar como App no Celular

Após acessar a URL do GitHub Pages pelo celular:

- **Android (Chrome)**: Toque no menu ⋮ → *"Adicionar à tela inicial"* ou *"Instalar app"*
- **iPhone (Safari)**: Toque no botão Compartilhar □↑ → *"Adicionar à Tela de Início"*

---

## 🔗 Integração Google Sheets

1. Crie uma planilha no [Google Sheets](https://sheets.google.com)
2. Vá em **Extensões → Apps Script**
3. Cole o código disponível em **Config → Ver Código Google Apps Script**
4. Publique como **Web App** (acesso: qualquer pessoa)
5. Cole a URL gerada na tela **Config** do sistema

---

## ⚙️ Tecnologias Utilizadas

- HTML5 + CSS3 + JavaScript puro (sem frameworks)
- [jsPDF 2.5.1](https://github.com/parallax/jsPDF) — geração de PDF
- [Font Awesome 6.5](https://fontawesome.com) — ícones
- Service Worker API — modo offline / PWA
- localStorage — armazenamento local dos dados

---

*MARLIFT SERVICE OS v3.0 — Desenvolvido para uso em campo, funciona offline.*


# MARLIFT SERVICE — UPGRADE VISUAL

## Alterações aplicadas

- Novo padrão visual amarelo/cinza
- Logo profissional MAR + LIFT + SERVICE
- Ícones PWA profissionais
- Tema simplificado
- Ajuste visual para aparência industrial
- Manifest atualizado
- Melhor aparência mobile

## Próximos ajustes recomendados

- Simplificar cores do PDF
- Ajustar assinatura fullscreen
- Posicionar técnico próximo do responsável
- Melhorar layout do cabeçalho PDF
