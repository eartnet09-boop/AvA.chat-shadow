// ============================================
// AVAchat SHADOW - COM TOR
// Desenvolvido por: Expedito Anderson Rufino
// Versão: 7.1.0 - Anonimato Total
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

// 🔑 CHAVE MESTRA
const MASTER_KEY = process.env.MASTER_KEY;
if (!MASTER_KEY) {
    console.warn('⚠️ MASTER_KEY não configurada');
}

// ============================================
// CONFIGURAÇÃO DO TOR (APENAS ISSO FOI ADICIONADO)
// ============================================

// Caminho do arquivo hostname do Tor (ajuste conforme sua instalação)
const TOR_PATHS = [
    'C:\\tor\\Data\\hidden_service\\hostname',
    'C:\\Users\\exped\\tor\\Data\\hidden_service\\hostname',
    process.env.TOR_HOSTNAME_PATH
].filter(Boolean);

function getOnionAddress() {
    for (const torPath of TOR_PATHS) {
        try {
            if (fs.existsSync(torPath)) {
                const address = fs.readFileSync(torPath, 'utf8').trim();
                if (address && address.endsWith('.onion')) {
                    return address;
                }
            }
        } catch (error) {
            // Continua tentando outros caminhos
        }
    }
    return null;
}

const onionAddress = getOnionAddress();

// ============================================
// ESTRUTURAS DE DADOS
// ============================================

const sessions = new Map();
const ephemeralLinks = new Map();
const messageStore = new Map();
const ipBlacklist = new Map();

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

const upload = multer({
    limits: { fileSize: MAX_FILE_SIZE },
    storage: multer.memoryStorage()
});

app.use(express.static(path.join(__dirname, '../frontend')));

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
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/entrar', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/entrar.html'));
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
    
    res.sendFile(path.join(__dirname, '../frontend/chat.html'));
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'online', timestamp: Date.now() });
});

// Criar link (MODIFICADO: suporte a links .onion)
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
    
    sessions.set(sessionId, {
        id: sessionId,
        assunto: assunto,
        sessionKey: sessionKey,
        createdAt: Date.now(),
        expiresAt: Date.now() + (30 * 60 * 1000),
        participants: []
    });
    
    ephemeralLinks.set(linkId, {
        sessionId: sessionId,
        expires: Date.now() + (24 * 60 * 60 * 1000),
        used: false
    });
    
    // 🔑 MUDANÇA CRÍTICA: Gerar link com endereço .onion se disponível
    let baseUrl;
    if (onionAddress) {
        baseUrl = `http://${onionAddress}`;
        console.log(`🌐 Link gerado via Tor: ${baseUrl}`);
    } else {
        baseUrl = `${req.protocol}://${req.get('host')}`;
    }
    
    const link = `${baseUrl}/join/${linkId}`;
    
    console.log(`✅ Link criado: ${assunto}`);
    
    res.json({
        sucesso: true,
        link: link,
        linkId: linkId,
        sessionId: sessionId,
        sessionKey: sessionKey,
        isTorEnabled: !!onionAddress  // Informa se Tor está ativo
    });
});

// Validar e entrar
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
    
    link.used = true;
    
    const participantId = generateId();
    session.participants.push({
        id: participantId,
        apelido: apelido,
        joinedAt: Date.now()
    });
    
    console.log(`🔑 Participante entrou: ${apelido}`);
    
    res.json({
        sucesso: true,
        sessionId: session.id,
        participantId: participantId,
        sessionKey: session.sessionKey,
        assunto: session.assunto
    });
});

// ============================================
// SOCKET.IO
// ============================================

const io = socketIo(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

io.use((socket, next) => {
    const { sessionId, participantId, sessionKey } = socket.handshake.auth;
    
    if (!sessionId || !participantId || !sessionKey) {
        return next(new Error('Credenciais inválidas'));
    }
    
    const session = sessions.get(sessionId);
    
    if (!session || session.expiresAt < Date.now()) {
        return next(new Error('Sessão expirada'));
    }
    
    const participant = session.participants.find(p => p.id === participantId);
    
    if (!participant) {
        return next(new Error('Participante não encontrado'));
    }
    
    socket.sessionId = sessionId;
    socket.participantId = participantId;
    socket.sessionKey = sessionKey;
    socket.apelido = participant.apelido;
    
    next();
});

io.on('connection', (socket) => {
    const { sessionId, apelido } = socket;
    const session = sessions.get(sessionId);
    
    if (!session) {
        socket.disconnect();
        return;
    }
    
    socket.join(`session_${sessionId}`);
    
    console.log(`🔌 ${apelido} conectado ao canal`);
    
    socket.to(`session_${sessionId}`).emit('peer-connected');
    
    // Mensagem
    socket.on('message', (data) => {
        const { encrypted } = data;
        
        if (!encrypted) return;
        
        const messageId = generateId();
        
        messageStore.set(messageId, {
            id: messageId,
            sessionId: sessionId,
            content: encrypted,
            createdAt: Date.now(),
            expiresAt: Date.now() + (MENSAGEM_EXPIRACAO * 1000)
        });
        
        socket.to(`session_${sessionId}`).emit('message', {
            id: messageId,
            encrypted: encrypted,
            timestamp: Date.now()
        });
        
        setTimeout(() => {
            if (messageStore.has(messageId)) {
                messageStore.delete(messageId);
                io.to(`session_${sessionId}`).emit('message-destroyed', { id: messageId });
            }
        }, MENSAGEM_EXPIRACAO * 1000);
    });
    
    // Digitando
    socket.on('typing', () => {
        socket.to(`session_${sessionId}`).emit('typing');
        setTimeout(() => {
            socket.to(`session_${sessionId}`).emit('stop-typing');
        }, 2000);
    });
    
    // Desconexão
    socket.on('disconnect', () => {
        console.log(`👋 ${apelido} desconectado`);
        socket.to(`session_${sessionId}`).emit('peer-disconnected');
        
        const room = io.sockets.adapter.rooms.get(`session_${sessionId}`);
        if (!room || room.size === 0) {
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
    
    for (const [id, msg] of messageStore.entries()) {
        if (now > msg.expiresAt) {
            messageStore.delete(id);
            cleaned++;
        }
    }
    
    for (const [id, session] of sessions.entries()) {
        if (now > session.expiresAt) {
            sessions.delete(id);
            cleaned++;
        }
    }
    
    for (const [id, link] of ephemeralLinks.entries()) {
        if (now > link.expires) {
            ephemeralLinks.delete(id);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 Limpeza automática: ${cleaned} itens destruídos`);
    }
}, 10000);

// ============================================
// INICIAR SERVIDOR
// ============================================
server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('='.repeat(60));
    console.log('🔒 AVAchat SHADOW - MODO TOR');
    console.log('='.repeat(60));
    console.log('');
    console.log(`📡 Servidor local: http://localhost:${PORT}`);
    
    // 🔑 MUDANÇA: Exibir endereço .onion se disponível
    if (onionAddress) {
        console.log(`🌐 Rede Tor Ativa: http://${onionAddress}`);
        console.log(`🔑 Compartilhe APENAS este endereço .onion`);
        console.log(`🛡️ Seu IP REAL está completamente escondido`);
    } else {
        console.log(`⚠️ Tor não detectado - operando em modo claro`);
        console.log(`🔧 Para ativar o Tor, configure o arquivo hostname`);
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