// ============================================
// AVAchat SHADOW - Gerenciador de Rede Tor
// Nível: ANÔNIMO / IMPOSSÍVEL DE RASTREAR
// ============================================

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class TorManager {
    constructor() {
        this.torProcess = null;
        this.onionAddress = null;
        this.socksPort = 9050;
        this.controlPort = 9051;
        this.hiddenServiceDir = path.join(__dirname, '../tor/data');
        this.isRunning = false;
    }

    /**
     * Inicia o serviço Tor
     * Baseado em Tinfoil Chat [citation:1] e Convoisum [citation:8]
     */
    async startTor() {
        console.log('🕵️ Iniciando serviço Tor...');

        // Criar diretório para dados do Tor
        if (!fs.existsSync(this.hiddenServiceDir)) {
            fs.mkdirSync(this.hiddenServiceDir, { recursive: true });
        }

        // Configuração do torrc
        const torrc = `
DataDirectory ${this.hiddenServiceDir}
SocksPort ${this.socksPort}
ControlPort ${this.controlPort}
CookieAuthentication 1
HiddenServiceDir ${this.hiddenServiceDir}/hidden_service
HiddenServicePort 80 127.0.0.1:${process.env.PORT || 3000}
ClientOnly 1
SafeSocks 1
RejectPlaintextPorts 1
WarnUnsafeSocks 0
        `;

        const torrcPath = path.join(this.hiddenServiceDir, 'torrc');
        fs.writeFileSync(torrcPath, torrc);

        // Iniciar processo Tor
        this.torProcess = spawn('tor', ['-f', torrcPath], {
            detached: true,
            stdio: 'ignore'
        });

        this.torProcess.unref();
        this.isRunning = true;

        // Aguardar o Tor iniciar e obter o endereço .onion
        await this.waitForOnionAddress();
        
        console.log(`🌐 Serviço Tor ativo: ${this.onionAddress}`);
        return this.onionAddress;
    }

    /**
     * Aguarda o Tor gerar o endereço .onion
     */
    async waitForOnionAddress() {
        const hostnameFile = path.join(this.hiddenServiceDir, 'hidden_service', 'hostname');
        
        // Aguardar até 30 segundos para o arquivo ser criado
        for (let i = 0; i < 30; i++) {
            await this.sleep(1000);
            if (fs.existsSync(hostnameFile)) {
                this.onionAddress = fs.readFileSync(hostnameFile, 'utf8').trim();
                return;
            }
        }
        throw new Error('Falha ao obter endereço .onion do Tor');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Verifica se o Tor está ativo
     */
    isTorAvailable() {
        return this.isRunning && this.torProcess !== null;
    }

    /**
     * Obtém o endereço .onion para compartilhar
     * Ex: abc123def456.onion
     */
    getOnionAddress() {
        return this.onionAddress;
    }

    /**
     * Gera um link de convite via Tor
     * O link é totalmente anônimo
     */
    generateTorLink(linkId) {
        if (!this.onionAddress) {
            return null;
        }
        return `http://${this.onionAddress}/join/${linkId}`;
    }

    /**
     * Encerra o serviço Tor
     */
    stopTor() {
        if (this.torProcess) {
            this.torProcess.kill();
            this.torProcess = null;
        }
        this.isRunning = false;
        console.log('🛑 Serviço Tor encerrado');
    }
}

module.exports = new TorManager();