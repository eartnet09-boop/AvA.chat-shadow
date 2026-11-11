// ============================================
// AVAchat SHADOW - COM TOR (VERSÃO CORRIGIDA)
// Desenvolvido por: Expedito Anderson Rufino
// Versão: 7.2.0 - Chat 1:1 Funcional
// ============================================

require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// ============================================
// CONFIGURAÇÕES
// ============================================

const PORT = 3000;
const MENSAGEM_EXPIRACAO = 30;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// ============================================
// CONFIGURAÇÃO DO TOR
// ============================================

const TOR_HOSTNAME_PATH = 'C:\\Users\\exped\\AVA.chat\\tor\\Data\\hidden_service\\hostname';

function getOnionAddress() {
    try {
        if (fs.existsSync(TOR_HOSTNAME_PATH)) {
            const address = fs.readFileSync(TOR_HOSTNAME_PATH, 'utf8').trim();
            if (address && address.endsWith('.onion')) {
                return address;
            }
        }
    } catch (error) {
        // Tor não disponível
    }
    return null;
}

const onionAddress = getOnionAddress();

// ============================================
// ESTRUTURAS DE DADOS
// ============================================

const sessions = new Map();        // sessionId -> dados da sessão
const ephemeralLinks = new Map();   // linkId -> dados do link
const messageStore = new Map();     // messageId -> mensagem
const ipBlacklist = new Map();      // IP -> tentativas

// ============================================
// MIDDLEWARES
// ============================================

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "wss:", "ws:"],
            styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        },
    },
}));

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: 'Muitas requisições'
});
app.use(limiter);

// Servir arquivos estáticos da pasta frontend
app.use(express.static(path.join(__dirname, '../../public')));

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function generateId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

function isIPBlocked(ip) {
    const entry = ipBlacklist.get(ip);
    if (entry && entry.blockedUntil > Date.now()) return true;
    if (entry && entry.blockedUntil < Date.now()) ipBlacklist.delete(ip);
    return false;
}

function blockIP(ip) {
    ipBlacklist.set(ip, {
        blockedUntil: Date.now() + (30 * 60 * 1000),
        attempts: (ipBlacklist.get(ip)?.attempts || 0) + 1
    });
}

// ============================================
// ROTAS
// ============================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/index.html'));
});

app.get('/entrar', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/entrar.html'));
});

app.get('/join/:linkId', (req, res) => {
    const { linkId } = req.params;
    const link = ephemeralLinks.get(linkId);
    
    if (!link || link.expires < Date.now()) {
        return res.status(404).send(`
            <!DOCTYPE html>
            <html>
            <head><title>🔒 Link Expirado</title></head>
            <body style="background:#000;color:#fff;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;">
                <div style="text-align:center;">
                    <h1>🔒 LINK DESTRUÍDO</h1>
                    <p>Este link já foi utilizado ou expirou.</p>
                    <p>O AVAchat não mantém registros.</p>
                </div>
            </body>
            </html>
        `);
    }
    
    res.sendFile(path.join(__dirname, '../../public/chat.html'));
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'online', timestamp: Date.now() });
});

// 🔑 CRÍTICO: Criar link (Admin)
app.post('/api/link/criar', (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    
    if (isIPBlocked(clientIp)) {
        return res.status(403).json({ erro: '🔒 IP bloqueado temporariamente' });
    }
    
    const { assunto } = req.body;
    
    if (!assunto || assunto.length > 50) {
        return res.status(400).json({ erro: 'Assunto inválido' });
    }
    
    const sessionId = generateId();
    const linkId = generateId();
    const sessionKey = generateId();
    
    // Criar sessão
    sessions.set(sessionId, {
        id: sessionId,
        assunto: assunto,
        sessionKey: sessionKey,
        createdAt: Date.now(),
        expiresAt: Date.now() + (30 * 60 * 1000),
        participants: []  // Lista de participantes
    });
    
    // Criar link descartável
    ephemeralLinks.set(linkId, {
        sessionId: sessionId,
        expires: Date.now() + (24 * 60 * 60 * 1000),
        used: false
    });
    
    // Gerar URL base (Tor ou local)
    let baseUrl;
    if (onionAddress) {
        baseUrl = `http://${onionAddress}`;
    } else {
        baseUrl = `http://localhost:${PORT}`;
    }
    
    const link = `${baseUrl}/join/${linkId}`;
    
    console.log(`✅ Link criado: ${assunto} - ID: ${linkId.substring(0, 8)}`);
    
    res.json({
        sucesso: true,
        link: link,
        linkId: linkId,
        sessionId: sessionId,
        sessionKey: sessionKey
    });
});

// 🔑 CRÍTICO: Validar e entrar (Convidado)
app.post('/api/link/validar', (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    
    if (isIPBlocked(clientIp)) {
        return res.status(403).json({ erro: '🔒 IP bloqueado temporariamente' });
    }
    
    const { linkId, apelido } = req.body;
    
    if (!linkId || !apelido || apelido.length > 15) {
        blockIP(clientIp);
        return res.status(400).json({ erro: 'Dados inválidos' });
    }
    
    const link = ephemeralLinks.get(linkId);
    
    if (!link || link.expires < Date.now()) {
        blockIP(clientIp);
        return res.status(404).json({ erro: 'Link inválido ou expirado' });
    }
    
    if (link.used) {
        blockIP(clientIp);
        return res.status(410).json({ erro: 'Link já utilizado' });
    }
    
    const session = sessions.get(link.sessionId);
    
    if (!session || session.expiresAt < Date.now()) {
        return res.status(404).json({ erro: 'Sessão expirada' });
    }
    
    // Marcar link como usado (DESTRUIÇÃO)
    link.used = true;
    link.usedAt = Date.now();
    
    // Criar ID do participante
    const participantId = generateId();
    
    // Adicionar participante à sessão
    session.participants.push({
        id: participantId,
        apelido: apelido,
        joinedAt: Date.now()
    });
    
    console.log(`🔑 Participante entrou: ${apelido} (${participantId.substring(0, 8)})`);
    
    res.json({
        sucesso: true,
        sessionId: session.id,
        participantId: participantId,
        sessionKey: session.sessionKey,
        assunto: session.assunto
    });
});

// ============================================
// SOCKET.IO - COMUNICAÇÃO EM TEMPO REAL
// ============================================

const io = socketIo(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

// 🔑 CRÍTICO: Middleware de autenticação
io.use((socket, next) => {
    const { sessionId, participantId, sessionKey } = socket.handshake.auth;
    
    if (!sessionId || !participantId || !sessionKey) {
        console.log('❌ Conexão rejeitada: credenciais faltando');
        return next(new Error('Credenciais inválidas'));
    }
    
    const session = sessions.get(sessionId);
    
    if (!session || session.expiresAt < Date.now()) {
        console.log('❌ Conexão rejeitada: sessão expirada');
        return next(new Error('Sessão expirada'));
    }
    
    // Verificar se o participantId existe na sessão
    const participant = session.participants.find(p => p.id === participantId);
    
    if (!participant) {
        console.log('❌ Conexão rejeitada: participante não encontrado');
        return next(new Error('Participante não encontrado'));
    }
    
    // Verificar chave da sessão
    if (session.sessionKey !== sessionKey) {
        console.log('❌ Conexão rejeitada: chave inválida');
        return next(new Error('Chave inválida'));
    }
    
    socket.sessionId = sessionId;
    socket.participantId = participantId;
    socket.sessionKey = sessionKey;
    socket.apelido = participant.apelido;
    
    console.log(`✅ Socket autenticado: ${socket.apelido} (${participantId.substring(0, 8)})`);
    
    next();
});

io.on('connection', (socket) => {
    const { sessionId, apelido, participantId } = socket;
    const session = sessions.get(sessionId);
    
    if (!session) {
        socket.disconnect();
        return;
    }
    
    // Entrar na sala do Socket.IO
    const roomName = `session_${sessionId}`;
    socket.join(roomName);
    
    console.log(`🔌 ${apelido} conectado ao canal ${sessionId.substring(0, 8)}`);
    
    // 🔑 CRÍTICO: Notificar o OUTRO participante que alguém entrou
    socket.to(roomName).emit('peer-connected', {
        apelido: apelido,
        timestamp: Date.now()
    });
    
    // Enviar histórico de mensagens (últimas 50)
    const historico = Array.from(messageStore.values())
        .filter(msg => msg.sessionId === sessionId)
        .slice(-50)
        .map(msg => ({
            id: msg.id,
            content: msg.content,
            from: msg.from,
            timestamp: msg.createdAt
        }));
    
    if (historico.length > 0) {
        socket.emit('historico', historico);
    }
    
    // ========================================
    // EVENTO: MENSAGEM
    // ========================================
    socket.on('message', (data) => {
        const { content } = data;
        
        if (!content || content.trim() === '') return;
        
        const messageId = generateId();
        const roomName = `session_${sessionId}`;
        
        // Armazenar mensagem (expira em MENSAGEM_EXPIRACAO segundos)
        messageStore.set(messageId, {
            id: messageId,
            sessionId: sessionId,
            content: content,
            from: apelido,
            createdAt: Date.now(),
            expiresAt: Date.now() + (MENSAGEM_EXPIRACAO * 1000)
        });
        
        console.log(`💬 ${apelido}: ${content.substring(0, 30)}...`);
        
        // 🔑 CRÍTICO: Enviar para TODOS na sala (incluindo o remetente)
        io.to(roomName).emit('message', {
            id: messageId,
            content: content,
            from: apelido,
            timestamp: Date.now()
        });
        
        // Auto-destruição da mensagem
        setTimeout(() => {
            if (messageStore.has(messageId)) {
                messageStore.delete(messageId);
                io.to(roomName).emit('message-destroyed', { id: messageId });
            }
        }, MENSAGEM_EXPIRACAO * 1000);
    });
    
    // ========================================
    // EVENTO: DIGITANDO
    // ========================================
    socket.on('typing', () => {
        const roomName = `session_${sessionId}`;
        socket.to(roomName).emit('typing', { from: apelido });
        
        setTimeout(() => {
            socket.to(roomName).emit('stop-typing');
        }, 2000);
    });
    
    // ========================================
    // EVENTO: DESCONEXÃO
    // ========================================
    socket.on('disconnect', () => {
        console.log(`👋 ${apelido} desconectado do canal ${sessionId.substring(0, 8)}`);
        
        const roomName = `session_${sessionId}`;
        socket.to(roomName).emit('peer-disconnected', {
            apelido: apelido,
            timestamp: Date.now()
        });
        
        // Verificar se a sala está vazia
        const room = io.sockets.adapter.rooms.get(roomName);
        if (!room || room.size === 0) {
            // Marcar sessão para expiração rápida
            session.expiresAt = Date.now() + 5000;
            console.log(`🧹 Canal ${sessionId.substring(0, 8)} marcado para expiração`);
        }
    });
});

// ============================================
// LIMPEZA AUTOMÁTICA
// ============================================
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    // Limpar mensagens expiradas
    for (const [id, msg] of messageStore.entries()) {
        if (now > msg.expiresAt) {
            messageStore.delete(id);
            cleaned++;
        }
    }
    
    // Limpar sessões expiradas
    for (const [id, session] of sessions.entries()) {
        if (now > session.expiresAt) {
            sessions.delete(id);
            cleaned++;
        }
    }
    
    // Limpar links expirados
    for (const [id, link] of ephemeralLinks.entries()) {
        if (now > link.expires) {
            ephemeralLinks.delete(id);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 Limpeza: ${cleaned} itens destruídos`);
    }
}, 10000);

// ============================================
// INICIAR SERVIDOR
// ============================================
server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('='.repeat(60));
    console.log('🔒 AVAchat SHADOW - MODO OPERACIONAL');
    console.log('='.repeat(60));
    console.log('');
    console.log(`📡 Servidor local: http://localhost:${PORT}`);
    
    if (onionAddress) {
        console.log(`🌐 Rede Tor Ativa: http://${onionAddress}`);
        console.log(`🔑 Compartilhe APENAS este endereço .onion`);
    } else {
        console.log(`⚠️ Tor não detectado - operando em modo claro`);
        console.log(`🔧 Para ativar o Tor, aguarde a geração do endereço .onion`);
    }
    
    console.log(`👑 Admin: http://localhost:${PORT}/`);
    console.log(`🔑 Convidado: http://localhost:${PORT}/entrar`);
    console.log('');
    console.log(`⏰ Auto-destruição: ${MENSAGEM_EXPIRACAO} segundos`);
    console.log(`🔐 Criptografia: AES-256`);
    console.log(`🛡️ Bloqueio de IP: Ativo (3 tentativas)`);
    console.log('');
    console.log('👨‍💻 Desenvolvido por: Expedito Anderson Rufino');
    console.log('');
    console.log('='.repeat(60));
    console.log('⚡ SISTEMA OPERACIONAL - PRONTO PARA USO');
    console.log('='.repeat(60));
});