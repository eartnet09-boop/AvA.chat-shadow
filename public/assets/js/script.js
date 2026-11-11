// ============================================
// AVAchat SHADOW - Cliente (VERSÃO CORRIGIDA)
// Desenvolvido por: Expedito Anderson Rufino
// ============================================

let socket = null;
let sessionId = null;
let participantId = null;
let sessionKey = null;
let meuApelido = null;
let typingTimeout = null;

// ============================================
// TELA DO ADMIN (index.html)
// ============================================

if (document.getElementById('btn-criar-link')) {
    const btnCriar = document.getElementById('btn-criar-link');
    const modal = document.getElementById('modal-link');
    const spanClose = document.querySelector('.modal-close');
    const btnFechar = document.getElementById('btn-fechar-modal');
    const btnCopiar = document.getElementById('btn-copiar-link');
    const linkInput = document.getElementById('link-gerado');
    const btnEntrarAdmin = document.getElementById('btn-entrar-admin');
    const adminApelido = document.getElementById('admin-apelido');

    let linkCriado = null;
    let sessionIdTemp = null;
    let sessionKeyTemp = null;

    btnCriar.addEventListener('click', async () => {
        const assunto = document.getElementById('assunto').value.trim();

        if (!assunto) {
            alert('⚠️ ASSUNTO OBRIGATÓRIO');
            return;
        }

        btnCriar.disabled = true;
        btnCriar.textContent = '⌛ CRIANDO...';

        try {
            const response = await fetch('/api/link/criar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assunto })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.erro);

            linkCriado = data.link;
            sessionIdTemp = data.sessionId;
            sessionKeyTemp = data.sessionKey;
            
            linkInput.value = data.link;
            modal.style.display = 'block';

        } catch (error) {
            alert('❌ ERRO: ' + error.message);
        } finally {
            btnCriar.disabled = false;
            btnCriar.textContent = '🔗 CRIAR LINK';
        }
    });

    if (btnCopiar) {
        btnCopiar.addEventListener('click', () => {
            linkInput.select();
            document.execCommand('copy');
            alert('✅ LINK COPIADO');
        });
    }

    if (btnEntrarAdmin) {
        btnEntrarAdmin.addEventListener('click', async () => {
            const apelido = adminApelido.value.trim();
            
            if (!apelido) {
                alert('⚠️ APELIDO OBRIGATÓRIO');
                return;
            }
            
            if (apelido.length > 15) {
                alert('⚠️ APELIDO MUITO LONGO (MÁX. 15)');
                return;
            }
            
            if (!linkCriado) {
                alert('⚠️ NENHUM LINK CRIADO');
                return;
            }
            
            let linkId = linkCriado;
            if (linkCriado.includes('/join/')) {
                linkId = linkCriado.split('/join/')[1];
            }
            
            btnEntrarAdmin.disabled = true;
            btnEntrarAdmin.textContent = '⌛ ENTRANDO...';
            
            try {
                const response = await fetch('/api/link/validar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ linkId: linkId, apelido: apelido })
                });
                
                const data = await response.json();
                if (!response.ok) throw new Error(data.erro);
                
                sessionId = data.sessionId;
                participantId = data.participantId;
                sessionKey = data.sessionKey;
                meuApelido = apelido;
                
                sessionStorage.setItem('sessionId', sessionId);
                sessionStorage.setItem('participantId', participantId);
                sessionStorage.setItem('sessionKey', sessionKey);
                sessionStorage.setItem('meuApelido', meuApelido);
                
                modal.style.display = 'none';
                window.location.href = '/chat.html';
                
            } catch (error) {
                alert('❌ ERRO: ' + error.message);
            } finally {
                btnEntrarAdmin.disabled = false;
                btnEntrarAdmin.textContent = '🚪 ENTRAR';
            }
        });
    }

    function fecharModal() {
        modal.style.display = 'none';
        adminApelido.value = '';
    }

    if (spanClose) spanClose.onclick = fecharModal;
    if (btnFechar) btnFechar.onclick = fecharModal;
}

// ============================================
// TELA DO CONVIDADO (entrar.html)
// ============================================

if (document.getElementById('btn-validar-link')) {
    const btnValidar = document.getElementById('btn-validar-link');
    const modalLoading = document.getElementById('modal-loading');
    const modalErro = document.getElementById('modal-erro');
    const btnFecharErro = document.getElementById('btn-fechar-erro');
    const msgErro = document.getElementById('msg-erro');

    function mostrarLoading() {
        if (modalLoading) modalLoading.style.display = 'block';
    }

    function esconderLoading() {
        if (modalLoading) modalLoading.style.display = 'none';
    }

    function mostrarErro(mensagem) {
        if (msgErro) msgErro.textContent = mensagem;
        if (modalErro) modalErro.style.display = 'block';
    }

    if (btnFecharErro) {
        btnFecharErro.addEventListener('click', () => {
            modalErro.style.display = 'none';
        });
    }

    btnValidar.addEventListener('click', async () => {
        const linkCompleto = document.getElementById('link-recebido').value.trim();
        const apelido = document.getElementById('convidado-apelido').value.trim();
        
        if (!linkCompleto) {
            mostrarErro('COLE O LINK RECEBIDO');
            return;
        }
        
        if (!apelido) {
            mostrarErro('DIGITE SEU APELIDO');
            return;
        }
        
        if (apelido.length > 15) {
            mostrarErro('APELIDO MUITO LONGO (MÁX. 15)');
            return;
        }

        let linkId = linkCompleto;
        if (linkCompleto.includes('/join/')) {
            linkId = linkCompleto.split('/join/')[1];
        }
        
        if (!linkId || linkId.length < 10) {
            mostrarErro('LINK INVÁLIDO');
            return;
        }

        mostrarLoading();

        try {
            const response = await fetch('/api/link/validar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ linkId: linkId, apelido: apelido })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.erro);
            
            sessionId = data.sessionId;
            participantId = data.participantId;
            sessionKey = data.sessionKey;
            meuApelido = apelido;
            
            sessionStorage.setItem('sessionId', sessionId);
            sessionStorage.setItem('participantId', participantId);
            sessionStorage.setItem('sessionKey', sessionKey);
            sessionStorage.setItem('meuApelido', meuApelido);
            
            window.location.href = '/chat.html';
            
        } catch (error) {
            esconderLoading();
            mostrarErro(error.message || 'ERRO DE CONEXÃO');
        }
    });
}

// ============================================
// TELA DO CHAT (chat.html)
// ============================================

if (document.querySelector('.chat-container')) {
    // Recuperar dados da sessão
    sessionId = sessionStorage.getItem('sessionId');
    participantId = sessionStorage.getItem('participantId');
    sessionKey = sessionStorage.getItem('sessionKey');
    meuApelido = sessionStorage.getItem('meuApelido');

    if (!sessionId || !participantId || !sessionKey || !meuApelido) {
        alert('SESSÃO EXPIRADA');
        window.location.href = '/entrar.html';
    }

    // Atualizar interface
    const titulo = document.getElementById('chat-titulo');
    if (titulo) titulo.textContent = 'CANAL SEGURO';
    
    const meuApelidoDisplay = document.getElementById('meu-apelido-display');
    if (meuApelidoDisplay) meuApelidoDisplay.textContent = `👤 ${meuApelido}`;

    const onlineIndicator = document.getElementById('online-indicator');
    const onlineText = document.getElementById('online-text');

    let outroConectado = false;

    // ========================================
    // CONEXÃO SOCKET
    // ========================================
    function conectarSocket() {
        socket = io({
            auth: { 
                sessionId: sessionId, 
                participantId: participantId, 
                sessionKey: sessionKey 
            },
            transports: ['websocket', 'polling']
        });

        socket.on('connect', () => {
            console.log('✅ Conectado ao servidor');
            adicionarMensagemSistema('🔐 CONEXÃO ESTABELECIDA');
        });

        socket.on('peer-connected', (data) => {
            outroConectado = true;
            if (onlineIndicator) onlineIndicator.classList.add('online');
            if (onlineText) onlineText.textContent = 'PARCEIRO CONECTADO';
            adicionarMensagemSistema(`🔌 PARCEIRO CONECTADO`);
        });

        socket.on('peer-disconnected', () => {
            outroConectado = false;
            if (onlineIndicator) onlineIndicator.classList.remove('online');
            if (onlineText) onlineText.textContent = 'AGUARDANDO CONEXÃO';
            adicionarMensagemSistema('⚠️ PARCEIRO DESCONECTADO');
        });

        socket.on('historico', (mensagens) => {
            mensagens.forEach(msg => {
                adicionarMensagem(msg.content, msg.from, msg.timestamp);
            });
        });

        socket.on('message', (data) => {
            adicionarMensagem(data.content, data.from, data.timestamp);
        });

        socket.on('message-destroyed', ({ id }) => {
            const msgElement = document.querySelector(`.message[data-id="${id}"]`);
            if (msgElement) {
                msgElement.style.opacity = '0';
                setTimeout(() => {
                    if (msgElement.parentNode) msgElement.remove();
                }, 500);
            }
        });

        socket.on('typing', (data) => {
            const indicator = document.getElementById('typing-indicator');
            indicator.style.display = 'block';
            indicator.innerHTML = `<span>✍️ ${data.from} está digitando...</span>`;
            setTimeout(() => {
                indicator.style.display = 'none';
            }, 2000);
        });

        socket.on('stop-typing', () => {
            document.getElementById('typing-indicator').style.display = 'none';
        });

        socket.on('disconnect', () => {
            adicionarMensagemSistema('❌ DESCONECTADO DO SERVIDOR');
            if (onlineIndicator) onlineIndicator.classList.remove('online');
            if (onlineText) onlineText.textContent = 'DESCONECTADO';
        });

        socket.on('connect_error', (error) => {
            console.error('Erro de conexão:', error);
            adicionarMensagemSistema('❌ ERRO DE CONEXÃO: ' + error.message);
        });
    }

    // ========================================
    // FUNÇÕES DE INTERFACE
    // ========================================
    function enviarMensagem() {
        const input = document.getElementById('mensagem');
        const conteudo = input.value.trim();
        
        if (!conteudo || !socket || !socket.connected) {
            if (!socket || !socket.connected) {
                adicionarMensagemSistema('❌ SEM CONEXÃO COM O SERVIDOR');
            }
            return;
        }
        
        socket.emit('message', { content: conteudo });
        input.value = '';
    }

    function adicionarMensagem(texto, autor, timestamp) {
        const messagesDiv = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        
        const isOwn = autor === meuApelido;
        
        messageDiv.className = `message ${isOwn ? 'message-own' : 'message-other'}`;
        
        const hora = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
        
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="apelido">${isOwn ? 'Você' : escapeHtml(autor)}</span>
                <span class="hora">${hora}</span>
            </div>
            <div class="message-text">${escapeHtml(texto)}</div>
            <div class="expiring-badge">⏰ 30s</div>
        `;
        
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        
        // Auto-destruição visual
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.style.opacity = '0';
                messageDiv.style.transition = 'opacity 0.5s';
                setTimeout(() => {
                    if (messageDiv.parentNode) messageDiv.remove();
                }, 500);
            }
        }, 28000);
    }

    function adicionarMensagemSistema(texto) {
        const messagesDiv = document.getElementById('chat-messages');
        const systemDiv = document.createElement('div');
        systemDiv.className = 'system-message';
        systemDiv.textContent = `⚡ ${texto}`;
        messagesDiv.appendChild(systemDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        
        setTimeout(() => {
            if (systemDiv.parentNode) systemDiv.remove();
        }, 5000);
    }

    function escapeHtml(texto) {
        const div = document.createElement('div');
        div.textContent = texto;
        return div.innerHTML;
    }

    // ========================================
    // EVENTOS DE UI
    // ========================================
    function setupEvents() {
        const inputMensagem = document.getElementById('mensagem');
        const btnEnviar = document.getElementById('btn-enviar');
        
        if (btnEnviar) {
            btnEnviar.addEventListener('click', enviarMensagem);
        }
        
        if (inputMensagem) {
            inputMensagem.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    enviarMensagem();
                }
            });
            
            inputMensagem.addEventListener('input', () => {
                if (socket && socket.connected) {
                    socket.emit('typing');
                    if (typingTimeout) clearTimeout(typingTimeout);
                    typingTimeout = setTimeout(() => {
                        if (socket) socket.emit('stop-typing');
                    }, 1000);
                }
            });
        }
    }

    // Iniciar
    conectarSocket();
    setupEvents();
}

console.log('✅ AVAchat SHADOW v7.2 carregado');